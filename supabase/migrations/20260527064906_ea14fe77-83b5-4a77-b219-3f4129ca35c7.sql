ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS deploy_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS deploy_verification_window_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS last_deploy_verification jsonb;