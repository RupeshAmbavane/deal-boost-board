import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { insertCustomers, upsertCustomers } from '@/services/customerService';
import { Loader2, Upload } from 'lucide-react';
import { Customer } from '@/types/customer';
import { supabase } from '@/integrations/supabase/client';

interface ImportCsvProps {
  onImported?: (count: number) => void;
  mode?: 'insert' | 'upsert';
}

// Very basic CSV parser for comma-separated values with a header row
function parseCsv(content: string) {
  const normalizedContent = content.replace(/^\uFEFF/, '');
  const lines = normalizedContent.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [] as any[];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
  return rows;
}

// Helper to normalize phone numbers (handle scientific notation from Excel)
const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  const num = parseFloat(phone);
  if (!isNaN(num) && phone.includes('E')) {
    return Math.round(num).toString();
  }
  return phone.replace(/[^\d+]/g, '').substring(0, 20);
};

// Helper to split full name into first and last name
const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
};

export const ImportCsv: React.FC<ImportCsvProps> = ({ onImported, mode = 'upsert' }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleChoose = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const text = await file.text();
      const rows = parseCsv(text);

      // Map CSV rows to Customer type
      const customers: Customer[] = [];
      const errors: string[] = [];

      rows.forEach((r, idx) => {
        // Try to get first and last name
        let firstName = r.first_name || r.firstname || '';
        let lastName = r.last_name || r.lastname || '';
        
        // Check if we have a full name field instead
        const fullName = r['full name'] || r.fullname || r.name || '';
        if (fullName && (!firstName || !lastName)) {
          const { firstName: fn, lastName: ln } = splitFullName(fullName);
          firstName = firstName || fn;
          lastName = lastName || ln;
        }

        const email = r.email || '';
        const phone = normalizePhone(r.phone_no || r.phonenumber || r['phone number'] || r.phone || '');
        const source = r.source || 'csv';
        const notes = r.notes || '';
        const status = (r.status || 'pending').toLowerCase();

        // Validate
        if (!email || !email.includes('@')) {
          errors.push(`Row ${idx + 2}: Invalid or missing email`);
          return;
        }
        if (!firstName && !lastName) {
          errors.push(`Row ${idx + 2}: Missing name (provide Full Name or First/Last Name)`);
          return;
        }

        customers.push({
          id: crypto.randomUUID(),
          sales_rep_user_id: user.id,
          first_name: firstName || 'Unknown',
          last_name: lastName || 'Unknown',
          email: email,
          phone_no: phone,
          source: source,
          notes: notes || null,
          status: status,
        });
      });

      if (customers.length === 0) {
        const errorMsg = errors.length > 0 
          ? `No valid rows found. Errors:\n${errors.slice(0, 5).join('\n')}`
          : 'CSV did not contain any valid rows.';
        toast({
          title: 'No valid rows',
          description: errorMsg,
          variant: 'destructive',
        });
        return;
      }

      const action = mode === 'insert' ? insertCustomers : upsertCustomers;
      await action(customers);

      const warningMsg = errors.length > 0 ? ` (${errors.length} row(s) skipped)` : '';
      toast({
        title: 'Import complete',
        description: `Imported ${customers.length} customer(s)${warningMsg}`,
      });
      onImported?.(customers.length);
    } catch (err) {
      console.error('CSV import error', err);
      let description = 'Unknown error';
      if (err instanceof Error) {
        description = err.message;
      } else if (err && typeof err === 'object') {
        const anyErr = err as any;
        description = anyErr?.message || anyErr?.details || anyErr?.hint || JSON.stringify(anyErr);
      }
      toast({
        title: 'Import failed',
        description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <Button onClick={handleChoose} disabled={loading} variant="outline">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </>
        )}
      </Button>
      <div className="text-xs text-muted-foreground">
        Flexible format: Supports First/Last Name or Full Name columns
      </div>
    </div>
  );
};

export default ImportCsv;
