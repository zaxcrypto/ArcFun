-- ==============================================================================
-- Migration 026: Reconcile arc_wallets Schema Compatibility
-- Safely ensures linked_external_address column exists without dropping data.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'arc_wallets' 
          AND column_name = 'linked_external_address'
    ) THEN
        ALTER TABLE public.arc_wallets ADD COLUMN linked_external_address text NULL;
    END IF;
END $$;
