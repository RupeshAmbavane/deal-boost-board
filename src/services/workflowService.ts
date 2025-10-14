import { supabase } from '@/integrations/supabase/client';

export interface Workflow {
  id: string;
  customer_id: string;
  tenant_id: string;
  status: string;
  current_step: string | null;
  step_data: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_updated: string;
  created_at: string;
}

export const createWorkflow = async (customerId: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, message: 'User not authenticated' };
    }

    // Get tenant_id from user_roles
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.tenant_id) {
      return { success: false, message: 'Tenant not found' };
    }

    const { error } = await supabase
      .from('workflows')
      .insert({
        customer_id: customerId,
        tenant_id: userRole.tenant_id,
        status: 'pending',
        current_step: 'initial',
      });

    if (error) {
      console.error('Error creating workflow:', error);
      return { success: false, message: 'Failed to create workflow' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in createWorkflow:', error);
    return { success: false, message: 'An unexpected error occurred' };
  }
};

export const getWorkflowByCustomer = async (customerId: string): Promise<Workflow | null> => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (error) {
      console.error('Error fetching workflow:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getWorkflowByCustomer:', error);
    return null;
  }
};

export const updateWorkflowStatus = async (
  workflowId: string,
  status: Workflow['status'],
  currentStep?: string,
  errorMessage?: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const updateData: any = {
      status,
      last_updated: new Date().toISOString(),
    };

    if (currentStep) {
      updateData.current_step = currentStep;
    }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('workflows')
      .update(updateData)
      .eq('id', workflowId);

    if (error) {
      console.error('Error updating workflow:', error);
      return { success: false, message: 'Failed to update workflow' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in updateWorkflowStatus:', error);
    return { success: false, message: 'An unexpected error occurred' };
  }
};

export const getAllWorkflows = async (): Promise<Workflow[]> => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching workflows:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllWorkflows:', error);
    return [];
  }
};
