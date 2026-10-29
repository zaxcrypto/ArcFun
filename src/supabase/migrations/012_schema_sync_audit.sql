-- ==========================================
-- PHASE 2: FINAL SCHEMA SYNCHRONIZATION AUDIT
-- Idempotent script to guarantee schema alignment with backend TS models.
-- ==========================================

-- -----------------------------------------------------
-- 1. ARC_WALLETS (Developer-Controlled Wallets)
-- -----------------------------------------------------
DO $$
BEGIN
    -- Ensure user_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arc_wallets' AND column_name='user_id') THEN
        ALTER TABLE public.arc_wallets ADD COLUMN user_id uuid;
    END IF;
END $$;

-- Drop obsolete Metamask/EVM anchor columns and constraints
ALTER TABLE public.arc_wallets DROP CONSTRAINT IF EXISTS arc_wallets_linked_external_address_blockchain_key;
ALTER TABLE public.arc_wallets DROP CONSTRAINT IF EXISTS arc_wallets_user_address_blockchain_key;
DROP INDEX IF EXISTS public.idx_arc_wallets_external;
ALTER TABLE public.arc_wallets DROP COLUMN IF EXISTS linked_external_address;

-- Ensure primary identity constraint
ALTER TABLE public.arc_wallets DROP CONSTRAINT IF EXISTS arc_wallets_user_id_blockchain_key;
ALTER TABLE public.arc_wallets ADD CONSTRAINT arc_wallets_user_id_blockchain_key UNIQUE(user_id, blockchain);

-- -----------------------------------------------------
-- 2. PAYMENT_LEDGER (Immutable Source of Truth)
-- -----------------------------------------------------
DO $$
BEGIN
    -- Ensure user_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_ledger' AND column_name='user_id') THEN
        ALTER TABLE public.payment_ledger ADD COLUMN user_id uuid;
    END IF;
END $$;

-- Ensure idempotency on circle_tx_id
ALTER TABLE public.payment_ledger DROP CONSTRAINT IF EXISTS payment_ledger_circle_tx_id_key;
ALTER TABLE public.payment_ledger ADD CONSTRAINT payment_ledger_circle_tx_id_key UNIQUE(circle_tx_id);

-- Ensure indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_payment_ledger_user ON public.payment_ledger(user_id);

-- -----------------------------------------------------
-- 3. ARC_ACCOUNTS (Root Identity & Lifecycle)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arc_accounts (
    user_id uuid PRIMARY KEY,
    account_status text DEFAULT 'ACTIVE',
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- -----------------------------------------------------
-- 4. LINKED_EXTERNAL_WALLETS (Optional Links)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.linked_external_wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    wallet_address text NOT NULL,
    wallet_type text NOT NULL,
    verification_method text NOT NULL,
    verified_at bigint NOT NULL,
    last_used_at bigint NOT NULL,
    is_primary boolean DEFAULT false,
    created_at bigint NOT NULL,
    UNIQUE(wallet_address)
);
CREATE INDEX IF NOT EXISTS idx_linked_external_user ON public.linked_external_wallets(user_id);

-- -----------------------------------------------------
-- 5. TRUSTED_DEVICES (Security Enhancements)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trusted_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    device_id text NOT NULL,
    device_name text,
    device_type text,
    platform text,
    browser text,
    trusted_until bigint,
    last_seen_at bigint NOT NULL,
    created_at bigint NOT NULL,
    UNIQUE(user_id, device_id)
);

-- -----------------------------------------------------
-- 6. USER_SECURITY_POLICIES (Granular AI & Rules)
-- -----------------------------------------------------
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
    
    -- Transaction Limits
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

-- -----------------------------------------------------
-- 7. ENABLE RLS AND POLICIES
-- -----------------------------------------------------
ALTER TABLE public.arc_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_external_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_policies ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Drop policies if they exist so we can recreate them
    DROP POLICY IF EXISTS "Service Role Only" ON public.arc_accounts;
    DROP POLICY IF EXISTS "Service Role Only" ON public.linked_external_wallets;
    DROP POLICY IF EXISTS "Service Role Only" ON public.trusted_devices;
    DROP POLICY IF EXISTS "Service Role Only" ON public.user_security_policies;

    -- Create strict Service Role only policies
    CREATE POLICY "Service Role Only" ON public.arc_accounts FOR ALL USING (false);
    CREATE POLICY "Service Role Only" ON public.linked_external_wallets FOR ALL USING (false);
    CREATE POLICY "Service Role Only" ON public.trusted_devices FOR ALL USING (false);
    CREATE POLICY "Service Role Only" ON public.user_security_policies FOR ALL USING (false);
END $$;
