-- Secure system_settings table by enforcing Row Level Security
BEGIN;

-- 1. Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 2. Drop all existing policies on the table to ensure a clean slate
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'system_settings' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_settings', pol.policyname);
  END LOOP;
END $$;

-- 3. Allow public reads (required for UI toggles)
CREATE POLICY "Public read system_settings" 
ON public.system_settings 
FOR SELECT 
USING (true);

-- 4. Remove unnecessary write privileges for anon and authenticated users
-- The service_role inherently retains all privileges and bypasses RLS.
REVOKE INSERT, UPDATE, DELETE ON public.system_settings FROM anon, authenticated;

COMMIT;
