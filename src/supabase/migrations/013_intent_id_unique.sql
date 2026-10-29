-- Ensure intent_id is unique to prevent replay attacks
ALTER TABLE public.payment_ledger ADD CONSTRAINT payment_ledger_intent_id_key UNIQUE(intent_id);
