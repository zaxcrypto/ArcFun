-- 029_gateway_webhook_events.sql
-- Production Idempotency & Audit Table for Circle Gateway Webhooks
-- Stores cryptographic event notifications, prevents replay attacks, and enforces service-role security.

CREATE TABLE IF NOT EXISTS public.gateway_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    wallet_address TEXT,
    tx_hash TEXT,
    transfer_id TEXT,
    status TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'processed' | 'ignored' | 'failed'
    error_message TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Strict unique constraint on Circle notification ID for deduplication and idempotency
ALTER TABLE public.gateway_webhook_events
    DROP CONSTRAINT IF EXISTS uq_gateway_webhook_notification_id;
ALTER TABLE public.gateway_webhook_events
    ADD CONSTRAINT uq_gateway_webhook_notification_id UNIQUE (notification_id);

-- Rapid lookup indices
CREATE INDEX IF NOT EXISTS idx_gateway_webhook_notification_id 
    ON public.gateway_webhook_events(notification_id);

CREATE INDEX IF NOT EXISTS idx_gateway_webhook_tx_hash 
    ON public.gateway_webhook_events(tx_hash) 
    WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gateway_webhook_wallet 
    ON public.gateway_webhook_events(wallet_address) 
    WHERE wallet_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gateway_webhook_status 
    ON public.gateway_webhook_events(status, created_at DESC);

-- Enable RLS
ALTER TABLE public.gateway_webhook_events ENABLE ROW LEVEL SECURITY;

-- Deny all public access; strictly accessible only by backend service role
DROP POLICY IF EXISTS "Deny public access to gateway webhook events" ON public.gateway_webhook_events;
CREATE POLICY "Deny public access to gateway webhook events" 
    ON public.gateway_webhook_events 
    FOR ALL 
    USING (false);

-- Enable Supabase Realtime publication on gateway_pending_transfers if not already enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'gateway_pending_transfers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_pending_transfers;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore error if supabase_realtime publication is managed by cloud dashboard
    NULL;
END $$;
