-- Webhook Events for Idempotency

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quick lookup index
CREATE INDEX IF NOT EXISTS idx_webhook_events_id ON public.webhook_events(id);
