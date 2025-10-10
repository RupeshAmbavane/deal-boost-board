import React, { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Customer } from '@/types/customer';
import { processClient } from '@/services/salesApi';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';

interface CustomerTableProps {
  data: Customer[];
  loading?: boolean;
  onDataChange?: () => void;
}

export const CustomerTable = ({ data, loading, onDataChange }: CustomerTableProps) => {
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [processingCustomers, setProcessingCustomers] = useState<Set<string>>(new Set());

  const columnHelper = createColumnHelper<Customer>();

  const handleProcessCustomer = async (customer: Customer) => {
    setProcessingCustomers(prev => new Set(prev).add(customer.id));
    
    try {
      const result = await processClient({
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phoneNo: customer.phone_no,
        notes: customer.notes || '',
      });
      
      if (result.success) {
        toast({
          title: 'Success',
          description: `Customer ${customer.first_name} ${customer.last_name} has been processed successfully.`,
        });
      } else {
        toast({
          title: 'Processing Failed',
          description: result.message || `Failed to process ${customer.first_name} ${customer.last_name}. Please try again.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while processing the customer.',
        variant: 'destructive',
      });
    } finally {
      setProcessingCustomers(prev => {
        const newSet = new Set(prev);
        newSet.delete(customer.id);
        return newSet;
      });
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('first_name', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            First Name
          </Button>
        ),
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('last_name', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Last Name
          </Button>
        ),
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('email', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Email
          </Button>
        ),
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('phone_no', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Phone
          </Button>
        ),
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('source', {
        header: 'Source',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: info => {
          const status = info.getValue() || 'pending';
          const variant = 
            status === 'active' ? 'default' :
            status === 'won' ? 'default' :
            status === 'lost' ? 'destructive' :
            'secondary';
          
          return (
            <Badge variant={variant} className={
              status === 'active' ? 'bg-green-600' :
              status === 'won' ? 'bg-blue-600' :
              status === 'lost' ? 'bg-red-600' :
              ''
            }>
              {status}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('notes', {
        header: 'Notes',
        cell: info => info.getValue() || '-',
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: info => {
          const customer = info.row.original;
          const isProcessing = processingCustomers.has(customer.id);
          
          return (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleProcessCustomer(customer)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Process Customer
                </>
              )}
            </Button>
          );
        },
      }),
    ],
    [columnHelper, processingCustomers, toast]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading customers...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder="Search customers..."
          value={globalFilter ?? ''}
          onChange={event => setGlobalFilter(String(event.target.value))}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b transition-colors hover:bg-muted/50 ${
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/25'
                  }`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="p-4 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};