
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS final_resolved_url text,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS product_slug_found boolean,
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS last_validation_error text,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_pin_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pin_queue_validation_status
  ON public.pinterest_pin_queue (validation_status, updated_at DESC);
