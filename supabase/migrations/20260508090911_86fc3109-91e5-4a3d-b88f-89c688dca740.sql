
CREATE TABLE IF NOT EXISTS public.pinterest_boards (
  id text PRIMARY KEY,
  name text NOT NULL,
  privacy text,
  owner_username text,
  pin_count integer,
  follower_count integer,
  board_created_at timestamptz,
  is_sandbox boolean NOT NULL DEFAULT false,
  is_blacklisted boolean NOT NULL DEFAULT false,
  blacklist_reason text,
  production_verified boolean NOT NULL DEFAULT false,
  production_verified_at timestamptz,
  last_validated_at timestamptz,
  last_validation_status integer,
  last_validation_error text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pinterest_boards" ON public.pinterest_boards;
CREATE POLICY "Admins manage pinterest_boards"
  ON public.pinterest_boards
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pinterest_boards_active
  ON public.pinterest_boards (is_blacklisted, is_sandbox, production_verified);

ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS active_board_id text,
  ADD COLUMN IF NOT EXISTS active_board_name text,
  ADD COLUMN IF NOT EXISTS last_pin_external_url text,
  ADD COLUMN IF NOT EXISTS last_pin_external_id text,
  ADD COLUMN IF NOT EXISTS last_pin_published_at timestamptz;
