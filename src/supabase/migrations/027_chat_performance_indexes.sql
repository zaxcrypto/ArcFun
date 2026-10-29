-- 027_chat_performance_indexes.sql
-- Scale Chat & Messaging to 1M+ active users with sub-millisecond lookups

-- 1. GIN Index on chats.participants for instant participant lookups at 1M+ rows
CREATE INDEX IF NOT EXISTS idx_chats_participants_gin ON public.chats USING GIN (participants);

-- 2. B-Tree Index on chats.last_message_at for ultra-fast sorted timeline queries
CREATE INDEX IF NOT EXISTS idx_chats_last_msg_at ON public.chats (last_message_at DESC);

-- 3. Composite Index on messages(receiver, seen) for zero-cost unread count aggregation
CREATE INDEX IF NOT EXISTS idx_messages_receiver_seen ON public.messages (receiver, seen);

-- 4. Composite Index on messages conversation history pagination
CREATE INDEX IF NOT EXISTS idx_messages_convo_history ON public.messages (sender, receiver, created_at DESC);

-- 5. Index on users address for instant batch profile hydration
CREATE INDEX IF NOT EXISTS idx_users_address_lower ON public.users (lower(address));
