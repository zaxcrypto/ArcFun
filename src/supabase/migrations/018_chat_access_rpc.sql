-- 018_chat_access_rpc.sql
-- Secure RPC for redeeming chat access codes
-- Prevents race conditions and TOCTOU bugs

CREATE OR REPLACE FUNCTION public.redeem_chat_access_code(
    p_address text,
    p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code_row record;
    v_existing_claim boolean;
BEGIN
    -- 1. Check if user already claimed a code
    SELECT EXISTS (
        SELECT 1 FROM public.chat_access_users 
        WHERE lower(address) = lower(p_address)
    ) INTO v_existing_claim;

    IF v_existing_claim THEN
        RETURN jsonb_build_object('success', false, 'error', 'User has already redeemed an access code');
    END IF;

    -- 2. Lock the code row for atomic update
    SELECT * INTO v_code_row
    FROM public.chat_access_codes
    WHERE upper(code) = upper(p_code)
    FOR UPDATE;

    -- 3. Validate code existence
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid access code');
    END IF;

    -- 4. Validate expiration
    IF v_code_row.expires_at IS NOT NULL AND v_code_row.expires_at < (EXTRACT(EPOCH FROM now()) * 1000) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access code has expired');
    END IF;

    -- 5. Validate max uses
    IF v_code_row.max_uses IS NOT NULL AND v_code_row.uses >= v_code_row.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access code has reached maximum uses');
    END IF;

    -- 6. Increment uses atomically
    UPDATE public.chat_access_codes
    SET uses = uses + 1
    WHERE upper(code) = upper(p_code);

    -- 7. Insert the user claim
    INSERT INTO public.chat_access_users (address, code_used, granted_at)
    VALUES (lower(p_address), upper(p_code), (EXTRACT(EPOCH FROM now()) * 1000));

    RETURN jsonb_build_object('success', true);
END;
$$;
