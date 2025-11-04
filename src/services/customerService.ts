import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/customer';

export const mapFromDb = (row: any): Customer => ({
  id: row.id,
  sales_rep_user_id: row.sales_rep_user_id,
  sales_rep_id: row.sales_rep_id,
  client_id: row.client_id,
  first_name: row.first_name,
  last_name: row.last_name,
  email: row.email,
  phone_no: row.phone_no,
  source: row.source,
  notes: row.notes,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapToDb = (customer: Customer) => ({
  id: customer.id,
  sales_rep_user_id: customer.sales_rep_user_id,
  sales_rep_id: customer.sales_rep_id,
  client_id: customer.client_id,
  first_name: customer.first_name,
  last_name: customer.last_name,
  email: customer.email,
  phone_no: customer.phone_no,
  source: customer.source,
  notes: customer.notes,
  status: customer.status,
});

export const getCustomers = async (): Promise<Customer[]> => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching customers:', error);
      return [];
    }

    return (data || []).map(mapFromDb);
  } catch (error) {
    console.error('Error in getCustomers:', error);
    return [];
  }
};

export const insertCustomers = async (customers: Customer[]): Promise<void> => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new Error('User not authenticated');
    }

    const customersToInsert = customers.map(customer => ({
      ...mapToDb(customer),
      sales_rep_user_id: userData.user.id,
    }));

    const { error } = await supabase
      .from('customers')
      .insert(customersToInsert);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error inserting customers:', error);
    throw error;
  }
};

export const upsertCustomers = async (customers: Customer[]): Promise<void> => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new Error('User not authenticated');
    }

    const customersToUpsert = customers.map(customer => ({
      ...mapToDb(customer),
      sales_rep_user_id: userData.user.id,
    }));

    const { error } = await supabase
      .from('customers')
      .upsert(customersToUpsert, {
        onConflict: 'sales_rep_user_id,email'
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error upserting customers:', error);
    throw error;
  }
};