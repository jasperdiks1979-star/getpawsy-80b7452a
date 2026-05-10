ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS pacing_mode text NOT NULL DEFAULT 'balanced';

ALTER TABLE public.pinterest_runtime_settings
  DROP CONSTRAINT IF EXISTS pinterest_runtime_settings_pacing_mode_check;

ALTER TABLE public.pinterest_runtime_settings
  ADD CONSTRAINT pinterest_runtime_settings_pacing_mode_check
  CHECK (pacing_mode IN ('slow', 'balanced', 'domination'));

ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS creative_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_fingerprint
  ON public.pinterest_pin_queue (creative_fingerprint, created_at DESC)
  WHERE creative_fingerprint IS NOT NULL;