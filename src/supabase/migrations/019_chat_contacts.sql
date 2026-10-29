-- 019_chat_contacts.sql
-- Secure the contacts table (works whether table exists already or is brand new)

-- 1. Create table if it doesn't exist yet (minimal schema)
CREATE TABLE IF NOT EXISTS public.contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_address text NOT NULL,
    contact_address text NOT NULL,
    contact_name text,
    color_index integer,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Safely add columns that may be missing on manually-created tables
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 3. Enforce the UNIQUE constraint (safe to re-run)
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_owner_address_contact_address_key;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_owner_address_contact_address_key UNIQUE(owner_address, contact_address);

-- 4. Remove any permissive policies
DROP POLICY IF EXISTS "Permissive Policy" ON public.contacts;

-- 5. Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 6. Read: own contacts only
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
CREATE POLICY "Users can view their own contacts" ON public.contacts
    FOR SELECT USING (
      (auth.jwt() ->> 'sub') = owner_address OR
      (auth.jwt() ->> 'email') = (owner_address || '@arcfun.xyz')
    );

-- 7. Insert: own contacts only
DROP POLICY IF EXISTS "Users can insert their own contacts" ON public.contacts;
CREATE POLICY "Users can insert their own contacts" ON public.contacts
    FOR INSERT WITH CHECK (
      (auth.jwt() ->> 'sub') = owner_address OR
      (auth.jwt() ->> 'email') = (owner_address || '@arcfun.xyz')
    );

-- 8. Update: own contacts only
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
CREATE POLICY "Users can update their own contacts" ON public.contacts
    FOR UPDATE USING (
      (auth.jwt() ->> 'sub') = owner_address OR
      (auth.jwt() ->> 'email') = (owner_address || '@arcfun.xyz')
    );

-- 9. Delete: own contacts only
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;
CREATE POLICY "Users can delete their own contacts" ON public.contacts
    FOR DELETE USING (
      (auth.jwt() ->> 'sub') = owner_address OR
      (auth.jwt() ->> 'email') = (owner_address || '@arcfun.xyz')
    );

-- 10. Enable realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'contacts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
    END IF;
END
$$;
