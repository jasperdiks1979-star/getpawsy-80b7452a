ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS pin_image_phash TEXT;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_phash
  ON public.pinterest_pin_queue (pin_image_phash)
  WHERE pin_image_phash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_created_at_desc
  ON public.pinterest_pin_queue (created_at DESC);