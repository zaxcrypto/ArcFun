-- MASTER SCHEMA DEPLOYMENT (PHASES 3, 4, 5, 6)

-- ==========================================
-- PHASE 3: ADMIN MAINTENANCE & ACCESS CODES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  bool_value boolean,
  updated_at bigint NOT NULL,
  updated_by text NOT NULL,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.chat_access_codes (
  code text PRIMARY KEY,
  name text NOT NULL,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  expires_at bigint,
  created_at bigint NOT NULL,
  created_by text NOT NULL,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.chat_access_users (
  address text PRIMARY KEY,
  code_used text,
  granted_at bigint NOT NULL,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.prediction_access_codes (
  code text PRIMARY KEY,
  name text NOT NULL,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  expires_at bigint,
  created_at bigint NOT NULL,
  created_by text NOT NULL,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.prediction_access_users (
  address text PRIMARY KEY,
  code_used text,
  granted_at bigint NOT NULL,
  convex_id text UNIQUE
);

-- ==========================================
-- PHASE 4: PREDICTION ARENA
-- ==========================================
CREATE TABLE IF NOT EXISTS public.prediction_markets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset text NOT NULL,
  market_id integer,
  start_time bigint NOT NULL,
  end_time bigint NOT NULL,
  start_price double precision,
  end_price double precision,
  status text NOT NULL,
  result boolean,
  total_pool double precision,
  up_pool double precision,
  down_pool double precision,
  convex_id text UNIQUE
);

CREATE INDEX idx_pred_markets_asset_status ON public.prediction_markets(asset, status);
CREATE INDEX idx_pred_markets_end_time ON public.prediction_markets(end_time);

CREATE TABLE IF NOT EXISTS public.prediction_bets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id uuid REFERENCES public.prediction_markets(id),
  on_chain_market_id integer NOT NULL,
  user_address text NOT NULL,
  direction boolean NOT NULL,
  amount double precision NOT NULL,
  resolved boolean DEFAULT false,
  claimed boolean DEFAULT false,
  convex_id text UNIQUE
);

CREATE INDEX idx_pred_bets_user ON public.prediction_bets(user_address);
CREATE INDEX idx_pred_bets_market ON public.prediction_bets(market_id);

-- ==========================================
-- PHASE 5: CHAT SYSTEM
-- ==========================================
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participants text[] NOT NULL,
  last_message_at bigint NOT NULL,
  last_message_body text,
  is_pinned boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  is_hidden boolean DEFAULT false,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid REFERENCES public.chats(id),
  sender text NOT NULL,
  receiver text NOT NULL,
  body text NOT NULL,
  media_url text,
  reactions jsonb DEFAULT '[]'::jsonb,
  seen boolean DEFAULT false,
  delivered boolean DEFAULT false,
  edited boolean DEFAULT false,
  deleted_for text[] DEFAULT '{}'::text[],
  created_at bigint NOT NULL,
  convex_id text UNIQUE
);

CREATE INDEX idx_messages_chat ON public.messages(chat_id);
CREATE INDEX idx_messages_sender ON public.messages(sender);
CREATE INDEX idx_messages_receiver ON public.messages(receiver);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender text NOT NULL,
  receiver text NOT NULL,
  amount double precision NOT NULL,
  token text NOT NULL,
  status text NOT NULL,
  active boolean DEFAULT true,
  created_at bigint NOT NULL,
  convex_id text UNIQUE
);

-- ==========================================
-- PHASE 6: ANALYTICS & LEADERBOARDS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.chat_analytics (
  date text PRIMARY KEY,
  total_messages integer DEFAULT 0,
  active_users integer DEFAULT 0,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.chat_global_stats (
  id text PRIMARY KEY,
  total_messages integer DEFAULT 0,
  total_payments double precision DEFAULT 0,
  convex_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.quest_leaderboard (
  wallet_address text PRIMARY KEY,
  points integer DEFAULT 0,
  quests_completed integer DEFAULT 0,
  last_updated bigint NOT NULL,
  convex_id text UNIQUE
);

-- ==========================================
-- SECURITY: GRANTS & RLS
-- ==========================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('platform_settings', 'chat_access_codes', 'chat_access_users', 'prediction_access_codes', 'prediction_access_users', 'prediction_markets', 'prediction_bets', 'chats', 'messages', 'payments', 'chat_analytics', 'chat_global_stats', 'quest_leaderboard')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon;', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', t);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', t);
        
        -- Default permissive policy for the migration phase (will be locked down later)
        EXECUTE format('CREATE POLICY "Permissive Policy" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t);
    END LOOP;
END $$;
