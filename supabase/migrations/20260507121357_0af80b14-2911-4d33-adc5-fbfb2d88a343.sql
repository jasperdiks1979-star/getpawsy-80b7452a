
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS scale_unlocked boolean NOT NULL DEFAULT false;

ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS image_hash text;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_image_hash
  ON public.pinterest_pin_queue (image_hash)
  WHERE image_hash IS NOT NULL;
