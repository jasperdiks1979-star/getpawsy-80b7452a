
-- Add unique constraint on user_id for upsert to work
ALTER TABLE public.merchant_oauth_tokens ADD CONSTRAINT merchant_oauth_tokens_user_id_key UNIQUE (user_id);
