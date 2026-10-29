-- =========================================================================
-- MIGRATION 031: ARCFUN AUTOPAY SCHEMA & EXECUTION-ENGINE PARITY
-- =========================================================================
-- Forward-only migration addressing live database audit findings:
-- 1. autopay_schedules: Adds weekly_day column and ensures last_execution_status supports CONFIRMED.
-- 2. autopay_executions: Adds missing audit & idempotency fields (idempotency_key, user_id, circle_wallet_id, recipient_address, blockchain).
-- 3. autopay_executions: Relaxes intent_id NOT NULL requirement and aligns status check constraint with CONFIRMED and SUCCESS.
-- 4. acquire_due_autopay_schedules: Replaces function to include weekly_day in RETURNS TABLE and SELECT.
-- =========================================================================

-- 1. autopay_schedules Schema Parity
ALTER TABLE public.autopay_schedules 
ADD COLUMN IF NOT EXISTS weekly_day INTEGER CHECK (weekly_day IS NULL OR (weekly_day BETWEEN 0 AND 6));

-- Update last_execution_status constraint to support CONFIRMED
ALTER TABLE public.autopay_schedules 
DROP CONSTRAINT IF EXISTS autopay_schedules_last_execution_status_check;

ALTER TABLE public.autopay_schedules 
ADD CONSTRAINT autopay_schedules_last_execution_status_check 
CHECK (last_execution_status IS NULL OR last_execution_status IN ('SUCCESS', 'CONFIRMED', 'FAILED', 'PENDING', 'SKIPPED'));

-- Update frequency constraint to support WEEKLY (fixes check constraint violation on legacy databases)
ALTER TABLE public.autopay_schedules 
DROP CONSTRAINT IF EXISTS autopay_schedules_frequency_check;

ALTER TABLE public.autopay_schedules 
ADD CONSTRAINT autopay_schedules_frequency_check 
CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY'));

-- Allow next_execution_at to be NULL when schedule is EXHAUSTED or CANCELLED
ALTER TABLE public.autopay_schedules 
ALTER COLUMN next_execution_at DROP NOT NULL;


-- 2. autopay_executions Schema Parity
ALTER TABLE public.autopay_executions 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

ALTER TABLE public.autopay_executions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.autopay_executions 
ADD COLUMN IF NOT EXISTS circle_wallet_id TEXT;

ALTER TABLE public.autopay_executions 
ADD COLUMN IF NOT EXISTS recipient_address TEXT;

ALTER TABLE public.autopay_executions 
ADD COLUMN IF NOT EXISTS blockchain TEXT NOT NULL DEFAULT 'ARC-TESTNET';

-- Allow intent_id to be nullable so idempotency_key serves as the primary idempotency anchor
ALTER TABLE public.autopay_executions ALTER COLUMN intent_id DROP NOT NULL;

-- Backfill user_id and wallet info on any pre-existing executions from parent schedule
UPDATE public.autopay_executions e
SET user_id = s.user_id,
    circle_wallet_id = s.circle_wallet_id,
    recipient_address = s.recipient_address,
    blockchain = s.blockchain
FROM public.autopay_schedules s
WHERE e.schedule_id = s.id
  AND e.user_id IS NULL;

-- Update status constraint to include CONFIRMED alongside SUCCESS
ALTER TABLE public.autopay_executions 
DROP CONSTRAINT IF EXISTS autopay_executions_status_check;

ALTER TABLE public.autopay_executions 
ADD CONSTRAINT autopay_executions_status_check 
CHECK (status IN ('QUEUED', 'SUBMITTING', 'PENDING', 'CONFIRMED', 'SUCCESS', 'FAILED'));

-- Performance Indices for Execution History & User Filtering
CREATE INDEX IF NOT EXISTS idx_autopay_executions_idempotency 
    ON public.autopay_executions(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autopay_executions_user 
    ON public.autopay_executions(user_id);


-- 3. Atomic Concurrency Lock Function (Stored Procedure) Parity
-- Drops old signature and re-creates with weekly_day included
DROP FUNCTION IF EXISTS public.acquire_due_autopay_schedules(INTEGER, BIGINT);

CREATE OR REPLACE FUNCTION public.acquire_due_autopay_schedules(
    p_limit INTEGER,
    p_now_epoch BIGINT
)
RETURNS TABLE (
    schedule_id UUID,
    user_id UUID,
    sender_wallet TEXT,
    circle_wallet_id TEXT,
    recipient_address TEXT,
    amount NUMERIC,
    token TEXT,
    blockchain TEXT,
    frequency TEXT,
    execution_time TEXT,
    timezone TEXT,
    monthly_day INTEGER,
    weekly_day INTEGER,
    max_per_payment NUMERIC,
    monthly_spending_limit NUMERIC,
    current_month_spent NUMERIC,
    current_month_cycle TEXT,
    authorization_version INTEGER,
    next_execution_at BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.user_id,
        s.sender_wallet,
        s.circle_wallet_id,
        s.recipient_address,
        s.amount,
        s.token,
        s.blockchain,
        s.frequency,
        s.execution_time,
        s.timezone,
        s.monthly_day,
        s.weekly_day,
        s.max_per_payment,
        s.monthly_spending_limit,
        s.current_month_spent,
        s.current_month_cycle,
        s.authorization_version,
        s.next_execution_at
    FROM public.autopay_schedules s
    WHERE s.status = 'ACTIVE'
      AND s.next_execution_at <= p_now_epoch
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
    ORDER BY s.next_execution_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED;
END;
$$;
