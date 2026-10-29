-- 017_users_rls_policies.sql
-- Enables users to securely INSERT and UPDATE their own profile.
-- Relies on the SIWE authentication proxy pattern which mints a user with email: [address]@arcfun.xyz

-- Ensure RLS is enabled (should already be from 006, but safe to repeat)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to ensure clean state
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- Policy for INSERT
CREATE POLICY "Users can insert their own profile"
ON public.users FOR INSERT
WITH CHECK (
  (auth.jwt() ->> 'sub' = lower(address)) OR 
  (auth.jwt() ->> 'email' = (lower(address) || '@arcfun.xyz'))
);

-- Policy for UPDATE
CREATE POLICY "Users can update their own profile"
ON public.users FOR UPDATE
USING (
  (auth.jwt() ->> 'sub' = lower(address)) OR 
  (auth.jwt() ->> 'email' = (lower(address) || '@arcfun.xyz'))
);
