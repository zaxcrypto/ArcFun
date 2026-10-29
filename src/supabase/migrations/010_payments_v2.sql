-- ==========================================
-- PHASE 0: PAYMENTS V2 & NATIVE WALLET
-- ==========================================

-- 1. Arc Wallets (Developer-Controlled Wallets Mapping)
CREATE TABLE IF NOT EXISTS public.arc_wallets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid, -- Future Supabase Auth User ID
  linked_external_address text NOT NULL, -- Current Metamask/EVM Anchor
  circle_wallet_set_id text NOT NULL,
  circle_wallet_id text NOT NULL,
  blockchain text NOT NULL,
  wallet_address text,
  ref_id text,
  status text DEFAULT 'provisioned',
  created_at bigint NOT NULL,
  UNIQUE(linked_external_address, blockchain)
);

CREATE INDEX idx_arc_wallets_external ON public.arc_wallets(linked_external_address);
CREATE INDEX idx_arc_wallets_user_id ON public.arc_wallets(user_id);

-- 2. Payment Ledger (Immutable Source of Truth)
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_tx_id text UNIQUE,
  blockchain_hash text,
  status text NOT NULL, -- INITIATED, PENDING, COMPLETED, FAILED
  amount numeric NOT NULL,
  token text NOT NULL,
  from_wallet text NOT NULL,
  to_wallet text NOT NULL,
  intent_id uuid,
  error_reason text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE INDEX idx_payment_ledger_circle_tx ON public.payment_ledger(circle_tx_id);
CREATE INDEX idx_payment_ledger_from ON public.payment_ledger(from_wallet);
CREATE INDEX idx_payment_ledger_to ON public.payment_ledger(to_wallet);

-- 3. AutoPay Rules
CREATE TABLE IF NOT EXISTS public.autopay_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address text NOT NULL,
  recipient_wallet text NOT NULL,
  max_amount numeric NOT NULL,
  token text NOT NULL,
  cron_schedule text,
  status text NOT NULL, -- ACTIVE, PAUSED, CANCELLED
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE INDEX idx_autopay_rules_user ON public.autopay_rules(user_address);

-- 4. Webhook Events (Idempotency and Processing)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_notification_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at bigint,
  created_at bigint NOT NULL
);

CREATE INDEX idx_webhook_events_processed ON public.webhook_events(processed);

-- ==========================================
-- SECURITY: GRANTS & RLS
-- ==========================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('arc_wallets', 'payment_ledger', 'autopay_rules', 'webhook_events')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon;', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', t);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', t);
        
        -- Drop the permissive policy if it was created
        EXECUTE format('DROP POLICY IF EXISTS "Permissive Policy" ON public.%I;', t);
        
        -- Production Grade RLS: 
        -- Payment infrastructure is highly sensitive. No direct frontend access (anon/authenticated) is permitted.
        -- All interactions MUST go through secure, signature-verified Backend API Routes or Edge Functions (which use service_role).
        EXECUTE format('CREATE POLICY "Service Role Only" ON public.%I FOR ALL USING (false);', t);
    END LOOP;
END $$;
