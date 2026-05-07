ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS pin_verified boolean,
  ADD COLUMN IF NOT EXISTS pin_verification_reason text,
  ADD COLUMN IF NOT EXISTS pin_verified_at timestamptz;