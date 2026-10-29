-- ==========================================
-- PHASE 3: MANUAL TRANSFER POLICIES
-- Add independent transfer policies to separate from autonomous AI boundaries.
-- Legacy columns are retained for backward compatibility.
-- ==========================================

ALTER TABLE public.user_security_policies 
  ADD COLUMN IF NOT EXISTS manual_send_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS manual_passkey_threshold_usd numeric DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS manual_daily_limit_usd numeric DEFAULT 1000.00;
