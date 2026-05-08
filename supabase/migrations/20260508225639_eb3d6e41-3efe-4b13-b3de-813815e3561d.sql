ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS meta JSONB NULL;