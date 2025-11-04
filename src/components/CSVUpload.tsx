import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { processClient } from '@/services/salesApi';

interface CSVUploadProps {
  onUploadSuccess: () => void;
}

export const CSVUpload = ({ onUploadSuccess }: CSVUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFileUpload = async (file: File) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to upload files.",
        variant: "destructive",
      });
      return;
    }

    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      // Create a unique filename
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      
      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('csv-imports')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Parse CSV and insert data
      const text = await file.text();
      const lines = text.split('\n');
      
      // Improved CSV parsing to handle quoted fields
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              // Handle escaped quotes
              current += '"';
              i++; // Skip next quote
            } else {
              // Toggle quote mode
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        
        // Add the last field
        result.push(current.trim());
        return result;
      };
      
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
      
      // Find column indices - try multiple variations, return -1 if not found
      const getColumnIndex = (columnVariations: string[]) => {
        for (const variation of columnVariations) {
          const index = headers.findIndex(header => 
            header.includes(variation.toLowerCase()) || 
            variation.toLowerCase().includes(header) ||
            header === variation.toLowerCase()
          );
          if (index !== -1) return index;
        }
        return -1;
      };

      const firstNameIdx = getColumnIndex(['firstname', 'first_name', 'fname', 'first name']);
      const lastNameIdx = getColumnIndex(['lastname', 'last_name', 'lname', 'last name']);
      const emailIdx = getColumnIndex(['email', 'email_address', 'mail']);
      const phoneIdx = getColumnIndex(['phoneno', 'phone_no', 'phone', 'mobile', 'contact']);
      const sourceIdx = getColumnIndex(['source', 'lead_source', 'origin']);
      const notesIdx = getColumnIndex(['notes', 'note', 'remarks', 'comments', 'description']);

      // Helper to normalize phone numbers (handle scientific notation from Excel)
      const normalizePhone = (phone: string): string => {
        if (!phone) return '';
        // If it's a number in scientific notation (e.g., 1.23E+10), convert it
        const num = parseFloat(phone);
        if (!isNaN(num) && phone.includes('E')) {
          return Math.round(num).toString();
        }
        // Remove non-numeric characters except + at start
        return phone.replace(/[^\d+]/g, '').substring(0, 20);
      };

      // Process data rows
      const dataRows = lines.slice(1).filter(line => line.trim());
      const clientsData = [];
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const line = dataRows[i];
        const columns = parseCSVLine(line).map(c => c.replace(/"/g, ''));
        
        // Skip completely empty rows
        if (!columns.some(col => col.length > 0)) continue;

        const firstName = firstNameIdx !== -1 ? columns[firstNameIdx]?.trim() : '';
        const lastName = lastNameIdx !== -1 ? columns[lastNameIdx]?.trim() : '';
        const email = emailIdx !== -1 ? columns[emailIdx]?.trim() : '';
        const phone = phoneIdx !== -1 ? normalizePhone(columns[phoneIdx]) : '';
        const source = sourceIdx !== -1 ? (columns[sourceIdx]?.trim() || 'CSV Import') : 'CSV Import';
        const notes = notesIdx !== -1 ? columns[notesIdx]?.trim() : '';

        // Validate required fields
        if (!email || !email.includes('@')) {
          errors.push(`Row ${i + 2}: Invalid or missing email`);
          continue;
        }
        if (!firstName && !lastName) {
          errors.push(`Row ${i + 2}: Missing both first and last name`);
          continue;
        }

        clientsData.push({
          sales_rep_user_id: user.id,
          first_name: firstName || 'Unknown',
          last_name: lastName || 'Unknown',
          email: email,
          phone_no: phone,
          source: source,
          notes: notes
        });
      }

      if (clientsData.length === 0) {
        const errorMsg = errors.length > 0 
          ? `No valid rows found. Errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`
          : 'No data rows found in CSV file';
        throw new Error(errorMsg);
      }

      // Insert data into Supabase
      const { error, data } = await supabase
        .from('customers')
        .insert(clientsData)
        .select();

      if (error) throw error;

      // Show warning if some rows had errors
      const warningMsg = errors.length > 0 
        ? ` ${errors.length} row(s) skipped due to validation errors.` 
        : '';

      toast({
        title: "Upload Successful",
        description: `Imported ${clientsData.length} customer(s).${warningMsg}`,
      });

      onUploadSuccess();

    } catch (error: any) {
      console.error('CSV upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to process CSV file. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Upload className="h-6 w-6" />
          Import Client Data
        </CardTitle>
        <CardDescription>
          Upload a CSV file containing your client data to get started
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver
              ? 'border-primary bg-primary/10'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          
          <div className="space-y-4">
            <div>
              <p className="text-lg font-medium">Drop your CSV file here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
            </div>
            
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
              disabled={uploading}
            />
            
            <label htmlFor="csv-upload">
              <Button 
                variant="outline" 
                className="cursor-pointer" 
                disabled={uploading}
                asChild
              >
                <span>
                  {uploading ? 'Processing...' : 'Select CSV File'}
                </span>
              </Button>
            </label>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Flexible CSV Format:</p>
              <p className="text-muted-foreground">
                Upload any CSV file. We'll automatically detect columns like FirstName, LastName, Email, Phone, Source
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Secure Processing:</p>
              <p className="text-muted-foreground">
                Your data is processed securely and stored in your private database
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};