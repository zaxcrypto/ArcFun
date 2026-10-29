-- Migration: Convex 'users' to Supabase 'public.users'

CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  address text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar text NOT NULL,
  photo_url text,
  bio text,
  twitter_id text,
  telegram_id text,
  last_seen bigint,
  is_online boolean DEFAULT false,
  convex_id text UNIQUE, -- To ensure 1:1 migration tracking
  created_at bigint
);

-- RLS Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anyone can read user profiles
CREATE POLICY "Users are viewable by everyone" 
ON public.users FOR SELECT 
USING (true);

-- Users can only update their own profile (assuming we pass the address in the where clause, 
-- or we rely on the service role for backend updates. For now, allow inserts/updates via service role).
-- The Service Role automatically bypasses RLS.

-- Index for fast lookup by wallet address
CREATE INDEX IF NOT EXISTS idx_users_address ON public.users(address);
