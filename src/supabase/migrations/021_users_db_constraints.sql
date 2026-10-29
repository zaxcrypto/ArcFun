-- 021_users_db_constraints.sql
-- Enforces size and length constraints on user profile columns to prevent payload bloating attacks.

-- 1. Display Name constraints (minimum 1, maximum 50 characters)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_name_length;
ALTER TABLE public.users ADD CONSTRAINT chk_users_name_length 
  CHECK (char_length(name) >= 1 AND char_length(name) <= 50);

-- 2. Photo URL constraint (maximum 2048 characters)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_photo_url_length;
ALTER TABLE public.users ADD CONSTRAINT chk_users_photo_url_length 
  CHECK (photo_url IS NULL OR char_length(photo_url) <= 2048);

-- 3. Twitter ID constraint (maximum 30 characters)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_twitter_id_length;
ALTER TABLE public.users ADD CONSTRAINT chk_users_twitter_id_length 
  CHECK (twitter_id IS NULL OR char_length(twitter_id) <= 30);

-- 4. Telegram ID constraint (maximum 50 characters)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_telegram_id_length;
ALTER TABLE public.users ADD CONSTRAINT chk_users_telegram_id_length 
  CHECK (telegram_id IS NULL OR char_length(telegram_id) <= 50);

-- 5. Bio constraint (maximum 500 characters)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_bio_length;
ALTER TABLE public.users ADD CONSTRAINT chk_users_bio_length 
  CHECK (bio IS NULL OR char_length(bio) <= 500);
