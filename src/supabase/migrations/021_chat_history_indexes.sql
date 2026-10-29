-- Migration 021_chat_history_indexes.sql
-- Create composite index on sender, receiver, and created_at for fast chat history pagination

CREATE INDEX IF NOT EXISTS idx_messages_convo_time ON public.messages(sender, receiver, created_at DESC);
