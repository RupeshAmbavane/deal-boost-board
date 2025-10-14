import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'client_admin' | 'sales_rep';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export const getUserRoles = async (): Promise<UserRole[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching user roles:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserRoles:', error);
    return [];
  }
};

export const hasRole = async (role: AppRole): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', role)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking role:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error in hasRole:', error);
    return false;
  }
};

export const getTenantId = async (): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching tenant ID:', error);
      return null;
    }

    return data?.tenant_id || null;
  } catch (error) {
    console.error('Error in getTenantId:', error);
    return null;
  }
};
