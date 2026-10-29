-- ==========================================
-- PHASE 1: FINAL IDENTITY & SECURITY ARCHITECTURE LOCK (ARC ACCOUNT MODEL)
-- ==========================================

-- 1. Arc Accounts (Root Identity & Lifecycle)
CREATE TABLE IF NOT EXISTS public.arc_accounts (
    user_id uuid PRIMARY KEY, -- REFERENCES auth.users(id) ON DELETE CASCADE
    account_status text DEFAULT 'ACTIVE', -- ACTIVE, LOCKED, RECOVERY, PENDING_VERIFICATION, SUSPENDED
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- 2. Arc Wallets Refinement (The Circle DCW)
ALTER TABLE public.arc_wallets DROP CONSTRAINT IF EXISTS arc_wallets_linked_external_address_blockchain_key;
ALTER TABLE public.arc_wallets DROP CONSTRAINT IF EXISTS arc_wallets_user_address_blockchain_key;
ALTER TABLE public.arc_wallets ALTER COLUMN linked_external_address DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arc_wallets' AND column_name='user_id') THEN
        ALTER TABLE public.arc_wallets ADD COLUMN user_id uuid;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_ledger' AND column_name='user_id') THEN
        ALTER TABLE public.payment_ledger ADD COLUMN user_id uuid;
    END IF;
END $$;

ALTER TABLE public.arc_wallets ADD CONSTRAINT arc_wallets_user_id_blockchain_key UNIQUE(user_id, blockchain);

-- 3. Linked External Wallets (Layer 3)
CREATE TABLE IF NOT EXISTS public.linked_external_wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL, -- REFERENCES auth.users(id) ON DELETE CASCADE
    wallet_address text NOT NULL,
    wallet_type text NOT NULL, -- e.g., 'metamask', 'phantom', 'rabby', 'ledger', 'coinbase_wallet'
    verification_method text NOT NULL, -- e.g., 'signature'
    verified_at bigint NOT NULL,
    last_used_at bigint NOT NULL,
    is_primary boolean DEFAULT false,
    created_at bigint NOT NULL,
    UNIQUE(wallet_address)
);

CREATE INDEX idx_linked_external_user ON public.linked_external_wallets(user_id);

-- 4. Trusted Devices
CREATE TABLE IF NOT EXISTS public.trusted_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    device_id text NOT NULL, -- Unique hardware/fingerprint ID
    device_name text,
    device_type text, -- 'mobile', 'desktop', 'tablet'
    platform text,
    browser text,
    trusted_until bigint,
    last_seen_at bigint NOT NULL,
    created_at bigint NOT NULL,
    UNIQUE(user_id, device_id)
);

-- 5. Security Policies & AI Permissions
CREATE TABLE IF NOT EXISTS public.user_security_policies (
    user_id uuid PRIMARY KEY,
    
    -- Granular AI Permissions
    ai_read_portfolio boolean DEFAULT true,
    ai_read_history boolean DEFAULT true,
    ai_payments_enabled boolean DEFAULT false,
    ai_swap_enabled boolean DEFAULT false,
    ai_bridge_enabled boolean DEFAULT false,
    ai_scheduling_enabled boolean DEFAULT false,
    ai_autopay_enabled boolean DEFAULT false,
    ai_future_trading_enabled boolean DEFAULT false,
    
    -- Transaction Limits (Configurable without code changes)
    max_ai_payment_usd numeric DEFAULT 0,
    max_daily_ai_spend_usd numeric DEFAULT 0,
    max_autopay_usd numeric DEFAULT 0,
    max_withdrawal_usd numeric DEFAULT 0,
    max_bridge_usd numeric DEFAULT 0,
    max_swap_usd numeric DEFAULT 0,
    
    -- Step-Up Authentication Rules
    require_passkey_for_withdrawals boolean DEFAULT true,
    require_passkey_for_large_swaps boolean DEFAULT true,
    require_passkey_for_large_bridge boolean DEFAULT true,
    
    updated_at bigint NOT NULL
);

-- 6. Strict RLS Policies for New Tables
ALTER TABLE public.arc_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_external_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Only" ON public.arc_accounts FOR ALL USING (false);
CREATE POLICY "Service Role Only" ON public.linked_external_wallets FOR ALL USING (false);
CREATE POLICY "Service Role Only" ON public.trusted_devices FOR ALL USING (false);
CREATE POLICY "Service Role Only" ON public.user_security_policies FOR ALL USING (false);
