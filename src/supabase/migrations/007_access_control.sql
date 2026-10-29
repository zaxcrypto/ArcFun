-- Phase 2: Access Control Migration
-- Supabase Schema for Swap & Bridge Gates

-- 1. Access Requests Table
CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text UNIQUE NOT NULL,
  score integer NOT NULL,
  components jsonb,
  timestamp bigint NOT NULL,
  signature text NOT NULL,
  request_status text NOT NULL DEFAULT 'pending',
  convex_id text UNIQUE -- For safe 1:1 migration
);

CREATE INDEX IF NOT EXISTS idx_access_requests_wallet ON public.access_requests(wallet_address);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests(request_status);

-- Enable RLS & PostgREST API Grants
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.access_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.access_requests TO authenticated;
GRANT ALL ON TABLE public.access_requests TO service_role;

-- Baseline Policies
CREATE POLICY "Access requests are viewable by everyone" ON public.access_requests FOR SELECT USING (true);
CREATE POLICY "Users can insert their own requests" ON public.access_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update requests" ON public.access_requests FOR UPDATE USING (true);


-- 2. On-chain Access Settings Table (The Kill Switches)
CREATE TABLE IF NOT EXISTS public.onchain_access_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module text UNIQUE NOT NULL, -- "swap" | "bridge"
  mode text NOT NULL, -- "Open To Everyone" | "Score Protected" | "Admin Only"
  updated_at bigint NOT NULL,
  updated_by text NOT NULL,
  convex_id text UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_onchain_access_settings_module ON public.onchain_access_settings(module);

-- Enable RLS & PostgREST API Grants
ALTER TABLE public.onchain_access_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.onchain_access_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.onchain_access_settings TO authenticated;
GRANT ALL ON TABLE public.onchain_access_settings TO service_role;

-- Baseline Policies
CREATE POLICY "Settings are viewable by everyone" ON public.onchain_access_settings FOR SELECT USING (true);
CREATE POLICY "Admins can insert settings" ON public.onchain_access_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update settings" ON public.onchain_access_settings FOR UPDATE USING (true);
