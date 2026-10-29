-- =========================================================================
-- MIGRATION 030: ARCFUN PRODUCTION AUTOPAY SCHEMA
-- =========================================================================
-- Phase 1: Database Migration for Recurring Payments on Arc Testnet (USDC)
-- Implements:
-- 1. autopay_schedules: Stores recurring payment authorizations & schedule state.
-- 2. autopay_executions: Audit trail of every automated execution attempt.
-- 3. Row-level security: Users only see their own schedules/executions; updates restricted to service_role.
-- 4. Atomic lock function: acquire_due_autopay_schedules (FOR UPDATE SKIP LOCKED) to prevent concurrent double-execution.
-- =========================================================================

-- 1. Autopay Schedules Table
CREATE TABLE IF NOT EXISTS public.autopay_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_wallet TEXT NOT NULL,
    circle_wallet_id TEXT NOT NULL,
    recipient_address TEXT NOT NULL,
    amount NUMERIC(18, 6) NOT NULL CHECK (amount > 0),
    token TEXT NOT NULL DEFAULT 'USDC',
    blockchain TEXT NOT NULL DEFAULT 'ARC-TESTNET',
    frequency TEXT NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    execution_time TEXT NOT NULL, -- e.g. '09:00' (24-hour HH:mm format)
    timezone TEXT NOT NULL DEFAULT 'UTC', -- IANA identifier, e.g. 'Asia/Kolkata'
    monthly_day INTEGER CHECK (monthly_day IS NULL OR (monthly_day BETWEEN 1 AND 31)),
    weekly_day INTEGER CHECK (weekly_day IS NULL OR (weekly_day BETWEEN 0 AND 6)),
    start_date DATE NOT NULL,
    end_date DATE,
    description TEXT,
    
    -- Spending Controls
    max_per_payment NUMERIC(18, 6) NOT NULL CHECK (max_per_payment > 0),
    monthly_spending_limit NUMERIC(18, 6) NOT NULL CHECK (monthly_spending_limit > 0),
    current_month_spent NUMERIC(18, 6) NOT NULL DEFAULT 0.00,
    current_month_cycle TEXT NOT NULL, -- e.g. '2026-10'
    
    -- Execution State
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXHAUSTED')),
    next_execution_at BIGINT NOT NULL, -- Epoch milliseconds UTC
    last_execution_at BIGINT,
    last_execution_status TEXT CHECK (last_execution_status IS NULL OR last_execution_status IN ('SUCCESS', 'FAILED', 'PENDING', 'SKIPPED')),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_error_reason TEXT,
    
    -- Authorization Tracking
    authorization_version INTEGER NOT NULL DEFAULT 1,
    authorized_at BIGINT NOT NULL,
    revoked_at BIGINT,
    
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Indices for high-frequency scheduler polling and user dashboards
CREATE INDEX IF NOT EXISTS idx_autopay_due_schedules 
    ON public.autopay_schedules(next_execution_at, status) 
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_autopay_user 
    ON public.autopay_schedules(user_id, status);

CREATE INDEX IF NOT EXISTS idx_autopay_sender_wallet 
    ON public.autopay_schedules(sender_wallet);

CREATE INDEX IF NOT EXISTS idx_autopay_recipient 
    ON public.autopay_schedules(recipient_address);

-- 2. Autopay Execution History Table
CREATE TABLE IF NOT EXISTS public.autopay_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES public.autopay_schedules(id) ON DELETE CASCADE,
    intent_id UUID NOT NULL UNIQUE,
    circle_tx_id TEXT UNIQUE,
    blockchain_tx_hash TEXT,
    amount NUMERIC(18, 6) NOT NULL CHECK (amount > 0),
    token TEXT NOT NULL DEFAULT 'USDC',
    status TEXT NOT NULL CHECK (status IN ('QUEUED', 'SUBMITTING', 'PENDING', 'CONFIRMED', 'FAILED')),
    scheduled_for BIGINT NOT NULL,
    executed_at BIGINT,
    error_reason TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autopay_executions_schedule 
    ON public.autopay_executions(schedule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopay_executions_intent 
    ON public.autopay_executions(intent_id);

CREATE INDEX IF NOT EXISTS idx_autopay_executions_circle_tx 
    ON public.autopay_executions(circle_tx_id) 
    WHERE circle_tx_id IS NOT NULL;

-- 3. Row Level Security Policies
ALTER TABLE public.autopay_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopay_executions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can view own autopay schedules" ON public.autopay_schedules;
DROP POLICY IF EXISTS "Users can view own autopay executions" ON public.autopay_executions;
DROP POLICY IF EXISTS "Service Role manages autopay schedules" ON public.autopay_schedules;
DROP POLICY IF EXISTS "Service Role manages autopay executions" ON public.autopay_executions;

-- Authenticated users can view their own schedules
CREATE POLICY "Users can view own autopay schedules"
    ON public.autopay_schedules FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Authenticated users can view execution records belonging to their schedules
CREATE POLICY "Users can view own autopay executions"
    ON public.autopay_executions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.autopay_schedules s 
            WHERE s.id = autopay_executions.schedule_id 
              AND s.user_id = auth.uid()
        )
    );

-- Backend service_role possesses full privileges (needed for cron worker & API endpoints)
CREATE POLICY "Service Role manages autopay schedules"
    ON public.autopay_schedules FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service Role manages autopay executions"
    ON public.autopay_executions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Atomic Concurrency Lock Function (Stored Procedure)
-- Acquires due schedules using FOR UPDATE SKIP LOCKED to prevent duplicate execution across parallel workers.
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
