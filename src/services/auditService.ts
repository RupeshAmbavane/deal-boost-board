import { supabase } from '@/integrations/supabase/client';

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_data: any;
  new_data: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const logAudit = async (
  action: string,
  resourceType: string,
  resourceId?: string,
  oldData?: Record<string, any>,
  newData?: Record<string, any>
): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get tenant_id from user_roles
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.tenant_id) return;

    await supabase.from('audit_logs').insert({
      tenant_id: userRole.tenant_id,
      user_id: user.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      old_data: oldData || null,
      new_data: newData || null,
      ip_address: null,
      user_agent: navigator.userAgent,
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
};

export const getAuditLogs = async (limit = 100): Promise<AuditLog[]> => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAuditLogs:', error);
    return [];
  }
};
