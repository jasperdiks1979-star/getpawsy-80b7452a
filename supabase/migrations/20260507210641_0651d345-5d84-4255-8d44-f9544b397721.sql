ALTER TABLE public.pinterest_connection
  ADD COLUMN IF NOT EXISTS token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes text,
  ADD COLUMN IF NOT EXISTS token_prefix text,
  ADD COLUMN IF NOT EXISTS token_sha256 text,
  ADD COLUMN IF NOT EXISTS last_account_status integer,
  ADD COLUMN IF NOT EXISTS last_boards_status integer,
  ADD COLUMN IF NOT EXISTS board_count integer;

CREATE INDEX IF NOT EXISTS idx_pinterest_connection_updated_at
  ON public.pinterest_connection (updated_at DESC);