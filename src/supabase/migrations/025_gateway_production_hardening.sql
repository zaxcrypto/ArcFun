-- 025_gateway_production_hardening.sql
-- Production Security & Reliability Hardening for Circle Gateway
-- Fixes RLS vulnerabilities, adds concurrency lock table, and enforces unique constraints.

-- 1. Create Distributed Relayer Locks Table for multi-instance nonce safety
CREATE TABLE IF NOT EXISTS public.gateway_relayer_locks (
    lock_id text PRIMARY KEY,
    domain_id integer NOT NULL,
    locked_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

ALTER TABLE public.gateway_relayer_locks ENABLE ROW LEVEL SECURITY;

-- Deny all public access to locks table (only service role may acquire/release locks)
DROP POLICY IF EXISTS "Deny public locks access" ON public.gateway_relayer_locks;
CREATE POLICY "Deny public locks access" ON public.gateway_relayer_locks
FOR ALL USING (false);

-- 2. Fix Insecure RLS Policies on gateway_pending_transfers
ALTER TABLE public.gateway_pending_transfers ENABLE ROW LEVEL SECURITY;

-- Drop insecure open policies from migration 024
DROP POLICY IF EXISTS "Allow users to read own pending transfers" ON public.gateway_pending_transfers;
DROP POLICY IF EXISTS "Allow public insert own pending transfers" ON public.gateway_pending_transfers;
DROP POLICY IF EXISTS "Allow public update own pending transfers" ON public.gateway_pending_transfers;

-- Secure Policy for SELECT: Users can ONLY read transfers where user_address matches their authenticated identity
CREATE POLICY "Users can only read their own gateway transfers"
ON public.gateway_pending_transfers FOR SELECT
USING (
    (auth.jwt() ->> 'sub' = lower(user_address)) OR
    (auth.jwt() ->> 'email' = (lower(user_address) || '@arcfun.xyz')) OR
    (current_user = 'service_role')
);

-- Secure Policy for INSERT: Users can ONLY insert transfers for their own wallet
CREATE POLICY "Users can only insert their own gateway transfers"
ON public.gateway_pending_transfers FOR INSERT
WITH CHECK (
    (auth.jwt() ->> 'sub' = lower(user_address)) OR
    (auth.jwt() ->> 'email' = (lower(user_address) || '@arcfun.xyz')) OR
    (current_user = 'service_role')
);

-- Secure Policy for UPDATE: Users can ONLY update their own transfers
CREATE POLICY "Users can only update their own gateway transfers"
ON public.gateway_pending_transfers FOR UPDATE
USING (
    (auth.jwt() ->> 'sub' = lower(user_address)) OR
    (auth.jwt() ->> 'email' = (lower(user_address) || '@arcfun.xyz')) OR
    (current_user = 'service_role')
);

-- 3. Deduplicate any existing historical rows before creating the UNIQUE index
DELETE FROM public.gateway_pending_transfers
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY source_tx_hash 
            ORDER BY 
                CASE WHEN status = 'minted' THEN 1 ELSE 2 END ASC,
                updated_at DESC, 
                created_at DESC
        ) AS rnum
        FROM public.gateway_pending_transfers
        WHERE source_tx_hash IS NOT NULL
    ) t
    WHERE t.rnum > 1
);

-- 4. Idempotency & Concurrency Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_pending_source_tx_hash 
ON public.gateway_pending_transfers (source_tx_hash) 
WHERE source_tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gateway_pending_created_status 
ON public.gateway_pending_transfers (status, created_at);

