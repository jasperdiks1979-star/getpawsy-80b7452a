ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS recovery_mode_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cap_recovery_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_trace jsonb;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_recovery_window
  ON public.pinterest_pin_queue (recovery_mode_publish, posted_at DESC)
  WHERE recovery_mode_publish = true AND status = 'posted';

UPDATE public.pinterest_runtime_settings
SET
  daily_pin_cap = 4,
  min_gap_minutes = 90,
  domination_mode = false,
  pacing_mode = 'balanced',
  safe_growth_mode = true,
  max_pins_per_product_per_day = 2,
  max_category_share_pct = 15,
  recovery_min_gap_hours = 12,
  updated_at = now()
WHERE id = 1;