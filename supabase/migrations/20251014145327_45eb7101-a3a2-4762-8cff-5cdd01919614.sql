-- Create app_role enum for proper role management
CREATE TYPE public.app_role AS ENUM ('client_admin', 'sales_rep');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  tenant_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, tenant_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to get user tenant via roles
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = _user_id 
  LIMIT 1
$$;

-- Create workflows table for customer onboarding tracking
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'failed')),
  current_step TEXT,
  step_data JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);

-- Enable RLS on workflows
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- Create audit_logs table for compliance and tracking
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Add status column to customers if not exists
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'won', 'lost'));

-- Migrate existing roles from profiles to user_roles
INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT user_id, role::text::public.app_role, client_id
FROM public.profiles
WHERE role IS NOT NULL AND client_id IS NOT NULL
ON CONFLICT (user_id, role, tenant_id) DO NOTHING;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policies for workflows
CREATE POLICY "Client admins can view all workflows in their tenant"
ON public.workflows FOR SELECT
USING (
  public.has_role(auth.uid(), 'client_admin') 
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "Sales reps can view workflows for their customers"
ON public.workflows FOR SELECT
USING (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE sales_rep_user_id = auth.uid()
  )
);

CREATE POLICY "Sales reps can insert workflows for their customers"
ON public.workflows FOR INSERT
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE sales_rep_user_id = auth.uid()
  )
);

CREATE POLICY "Sales reps can update workflows for their customers"
ON public.workflows FOR UPDATE
USING (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE sales_rep_user_id = auth.uid()
  )
);

-- RLS Policies for audit_logs
CREATE POLICY "Client admins can view audit logs for their tenant"
ON public.audit_logs FOR SELECT
USING (
  public.has_role(auth.uid(), 'client_admin')
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (true);

-- Trigger for workflow updates
CREATE TRIGGER update_workflows_updated_at
BEFORE UPDATE ON public.workflows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for user_roles updates
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for workflows
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflows;

-- Enable realtime for audit_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- Update handle_new_user to create user_roles entry
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_role public.app_role;
BEGIN
  -- Determine role from metadata
  v_role := CASE 
    WHEN NEW.raw_user_meta_data ->> 'role' = 'sales_rep' THEN 'sales_rep'::public.app_role
    ELSE 'client_admin'::public.app_role
  END;
  
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name, role)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data ->> 'display_name',
    CASE 
      WHEN NEW.raw_user_meta_data ->> 'role' = 'sales_rep' THEN 'sales_rep'::public.user_role
      ELSE 'client_admin'::public.user_role
    END
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Get or create client_id
  SELECT client_id INTO v_client_id
  FROM public.profiles
  WHERE user_id = NEW.id;
  
  -- If no client_id and is admin, create one
  IF v_client_id IS NULL AND v_role = 'client_admin' THEN
    INSERT INTO public.clients (client_name)
    VALUES (COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company'))
    RETURNING id INTO v_client_id;
    
    UPDATE public.profiles 
    SET client_id = v_client_id
    WHERE user_id = NEW.id;
  END IF;
  
  -- Create user_roles entry if we have a tenant
  IF v_client_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, v_role, v_client_id)
    ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;