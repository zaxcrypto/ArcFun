-- 022_chat_hardening.sql
-- Production Blocker Fixes: Message Size + Chat Velocity
-- Addresses 3 verified exploit findings from Red Team audit

-- ============================================================
-- PART 1: Message Body Length Constraint
-- Prevents data-bomb attacks (10MB+ payloads accepted in exploit test)
-- ============================================================

-- Add CHECK constraint to limit message body to 2000 characters
ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_max_length
  CHECK (length(body) <= 2000);

-- ============================================================
-- PART 2: Database-Enforced Chat Velocity Limit
-- Prevents unlimited message spam from authenticated users
-- (exploit test showed 100 messages at 5.3 msg/sec with zero throttling)
-- ============================================================

-- Rate tracking table for per-sender velocity enforcement
CREATE TABLE IF NOT EXISTS public.message_rate_limits (
  sender text PRIMARY KEY,
  window_start bigint NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.message_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service_role can access this table
CREATE POLICY "Service Role Only" ON public.message_rate_limits
  FOR ALL USING (false);

GRANT ALL ON TABLE public.message_rate_limits TO service_role;

-- Create the rate-limiting trigger function
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start bigint;
  v_count integer;
  v_now bigint;
  v_window_ms bigint := 60000; -- 1 minute window
  v_max_messages integer := 60; -- 60 messages per minute
BEGIN
  v_now := EXTRACT(EPOCH FROM now()) * 1000;

  -- Atomic upsert: get-or-create the rate limit row and lock it
  INSERT INTO public.message_rate_limits (sender, window_start, message_count)
  VALUES (NEW.sender, v_now, 0)
  ON CONFLICT (sender) DO NOTHING;

  SELECT window_start, message_count
  INTO v_window_start, v_count
  FROM public.message_rate_limits
  WHERE sender = NEW.sender
  FOR UPDATE;

  -- Reset window if expired
  IF (v_now - v_window_start) >= v_window_ms THEN
    UPDATE public.message_rate_limits
    SET window_start = v_now, message_count = 1
    WHERE sender = NEW.sender;
    RETURN NEW;
  END IF;

  -- Check velocity
  IF v_count >= v_max_messages THEN
    RAISE EXCEPTION 'Message rate limit exceeded (% per minute). Please wait.', v_max_messages
      USING ERRCODE = 'P0429';
  END IF;

  -- Increment counter
  UPDATE public.message_rate_limits
  SET message_count = v_count + 1
  WHERE sender = NEW.sender;

  RETURN NEW;
END;
$$;

-- Attach trigger to messages table
DROP TRIGGER IF EXISTS trg_message_rate_limit ON public.messages;
CREATE TRIGGER trg_message_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_rate_limit();
