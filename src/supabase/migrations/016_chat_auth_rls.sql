-- 016_chat_auth_rls.sql
-- Implement strict SIWE Auth and destroy permissive policies

-- 1. Create auth_challenges table for Nonces
CREATE TABLE IF NOT EXISTS public.auth_challenges (
    address text PRIMARY KEY,
    nonce text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

-- Ensure anon and authenticated can't access auth_challenges directly via API
ALTER TABLE public.auth_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only on auth_challenges" ON public.auth_challenges FOR ALL USING (false);

-- 2. Create auth_logs table
CREATE TABLE IF NOT EXISTS public.auth_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet text NOT NULL,
    ip text,
    user_agent text,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only on auth_logs" ON public.auth_logs FOR ALL USING (false);

-- 3. Destroy Permissive Policies for Chat & Pay
DROP POLICY IF EXISTS "Permissive Policy" ON public.chats;
DROP POLICY IF EXISTS "Permissive Policy" ON public.messages;
DROP POLICY IF EXISTS "Permissive Policy" ON public.payments;

-- 4. Enable RLS on Chat & Pay (already enabled, but let's be sure)
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies for Messages
CREATE POLICY "Read own messages" ON public.messages
    FOR SELECT USING ((auth.jwt() ->> 'sub') = sender OR (auth.jwt() ->> 'sub') = receiver);

CREATE POLICY "Send messages" ON public.messages
    FOR INSERT WITH CHECK ((auth.jwt() ->> 'sub') = sender);

CREATE POLICY "Edit own messages" ON public.messages
    FOR UPDATE USING ((auth.jwt() ->> 'sub') = sender);

-- 6. Strict RLS Policies for Chats
CREATE POLICY "Read own chats" ON public.chats
    FOR SELECT USING ((auth.jwt() ->> 'sub') = ANY(participants));

CREATE POLICY "Create chats" ON public.chats
    FOR INSERT WITH CHECK ((auth.jwt() ->> 'sub') = ANY(participants) AND array_length(participants, 1) = 2);

CREATE POLICY "Update own chats" ON public.chats
    FOR UPDATE USING ((auth.jwt() ->> 'sub') = ANY(participants));

-- 7. Strict RLS Policies for Payments
CREATE POLICY "Read own payments" ON public.payments
    FOR SELECT USING ((auth.jwt() ->> 'sub') = sender OR (auth.jwt() ->> 'sub') = receiver);

CREATE POLICY "Insert own payments" ON public.payments
    FOR INSERT WITH CHECK ((auth.jwt() ->> 'sub') = sender);

CREATE POLICY "Update own payments" ON public.payments
    FOR UPDATE USING ((auth.jwt() ->> 'sub') = sender OR (auth.jwt() ->> 'sub') = receiver);

-- Note: We also need to drop "Permissive Policy" on chat_analytics, chat_global_stats, quest_leaderboard if we want to be complete, but focusing on Chat & Pay first.
DROP POLICY IF EXISTS "Permissive Policy" ON public.chat_access_users;
DROP POLICY IF EXISTS "Permissive Policy" ON public.chat_access_codes;
