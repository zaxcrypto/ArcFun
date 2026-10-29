-- ==============================================================================
-- Migration 028: Fix SOL History Amounts in payment_ledger
-- Reconciles payment_ledger records where USD valuation was previously saved
-- into the token amount column instead of the actual token quantity.
-- ==============================================================================

UPDATE public.payment_ledger
SET amount = 0.5,
    status = 'COMPLETE',
    updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
WHERE id = '341f9476-becf-42e7-aa4a-e28797456f53' OR intent_id = 'a62023a6-4c75-47ef-a92b-ea7f29a9aec5';

UPDATE public.payment_ledger
SET amount = 0.1,
    status = 'COMPLETE',
    updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
WHERE id = 'fd5d8228-6d12-482f-ade9-e57f0c47c7e4' OR intent_id = 'f2f35dd3-8523-41e2-9ab2-4ea09a06a241';

UPDATE public.payment_ledger
SET amount = 1.0,
    status = 'FAILED',
    updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
WHERE id = 'cc21ebb2-beb6-40a6-a818-385ad37f9cd1' OR intent_id = '245df25f-3464-43b0-b6b4-3033b2040956';

UPDATE public.payment_ledger
SET amount = 1.0,
    status = 'FAILED',
    updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
WHERE id = 'f0eb650e-37b0-4c7f-9c45-25d1507a53c5' OR intent_id = '972af5dd-68ca-46d0-a214-7dc65ee5480f';
