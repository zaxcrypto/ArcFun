CREATE TABLE IF NOT EXISTS public.gateway_pending_transfers (
    id text PRIMARY KEY,                          -- transferId, salt, or txHash
    user_address text NOT NULL,                   -- Lowercased wallet address
    source_domain integer NOT NULL,
    dest_domain integer NOT NULL,
    amount numeric(20, 6) NOT NULL,              -- Exact locked on-chain amount
    receive_amount numeric(20, 6) NOT NULL,
    source_tx_hash text,                         -- On-chain deposit tx hash (proof gas was paid)
    status text NOT NULL DEFAULT 'deposited_indexing', -- 'deposited_indexing' | 'ready_to_sign' | 'attestation_ready' | 'minted' | 'failed'
    is_manual_claim boolean NOT NULL DEFAULT false,
    platform_fee_percent numeric(5, 4) NOT NULL DEFAULT 0.01,
    burn_intent_set jsonb,
    attestation_payload text,
    operator_signature text,
    destination_tx_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices for rapid lookup by user and status
CREATE INDEX IF NOT EXISTS idx_gateway_pending_user_status 
ON public.gateway_pending_transfers(user_address, status);

-- Enable RLS
ALTER TABLE public.gateway_pending_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to read own pending transfers" 
ON public.gateway_pending_transfers FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert own pending transfers" 
ON public.gateway_pending_transfers FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update own pending transfers" 
ON public.gateway_pending_transfers FOR UPDATE 
USING (true);
