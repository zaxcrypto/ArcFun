-- Migration 014: Arc Wallet Security Center schema expansion

-- Ensure the table exists just in case it is a fresh environment
CREATE TABLE IF NOT EXISTS public.user_security_policies (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add all new columns safely to the existing table
ALTER TABLE public.user_security_policies
    ADD COLUMN IF NOT EXISTS passkey_mode VARCHAR(50) DEFAULT 'ALWAYS',
    ADD COLUMN IF NOT EXISTS passkey_threshold NUMERIC DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS password_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auto_lock_duration_minutes INTEGER DEFAULT 5,
    ADD COLUMN IF NOT EXISTS max_transaction_amount NUMERIC DEFAULT 1000.0,
    ADD COLUMN IF NOT EXISTS daily_transfer_limit NUMERIC DEFAULT 5000.0,
    ADD COLUMN IF NOT EXISTS daily_transfer_count_limit INTEGER DEFAULT 20,
    ADD COLUMN IF NOT EXISTS auth_policy_mode VARCHAR(50) DEFAULT 'ALWAYS',
    ADD COLUMN IF NOT EXISTS privacy_hide_balances BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS privacy_blur_mode BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS privacy_desktop_mode BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_large_transfers BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_new_device BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_policy_changes BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_transfer_failures BOOLEAN DEFAULT TRUE;

-- Active Sessions (for Trusted Devices & Active Sessions management)
CREATE TABLE IF NOT EXISTS public.arc_active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(100),
    browser VARCHAR(50),
    os VARCHAR(50),
    is_trusted BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.user_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_active_sessions ENABLE ROW LEVEL SECURITY;

-- Idempotent Policies for user_security_policies
DROP POLICY IF EXISTS "Users can view own security policies" ON public.user_security_policies;
CREATE POLICY "Users can view own security policies"
ON public.user_security_policies FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own security policies" ON public.user_security_policies;
CREATE POLICY "Users can update own security policies"
ON public.user_security_policies FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own security policies" ON public.user_security_policies;
CREATE POLICY "Users can insert own security policies"
ON public.user_security_policies FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Idempotent Policies for arc_active_sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON public.arc_active_sessions;
CREATE POLICY "Users can view own sessions"
ON public.arc_active_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own sessions" ON public.arc_active_sessions;
CREATE POLICY "Users can manage own sessions"
ON public.arc_active_sessions FOR ALL
TO authenticated
USING (auth.uid() = user_id);
