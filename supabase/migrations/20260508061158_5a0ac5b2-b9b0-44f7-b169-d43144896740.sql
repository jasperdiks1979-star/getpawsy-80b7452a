
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS production_publish_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_publish_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_trial_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_pin_publish_error text,
  ADD COLUMN IF NOT EXISTS last_pin_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_client_id_prefix text;
