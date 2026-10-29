-- Migration 023: Add type column to payment_ledger
-- This column tracks transaction type (SWAP, BRIDGE, TRANSFER)
-- Required by policy-engine.ts ledger locking logic

ALTER TABLE public.payment_ledger ADD COLUMN IF NOT EXISTS type text;

-- Backfill existing rows based on bridge_txs join or leave as NULL for legacy rows
-- New rows will always have this field set by policy-engine.ts

-- Create index for type-based filtering
CREATE INDEX IF NOT EXISTS idx_payment_ledger_type ON public.payment_ledger(type);
