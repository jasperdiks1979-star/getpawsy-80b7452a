
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS safe_growth_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_cooldown_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS max_pins_per_product_per_day integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_category_share_pct integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS recovery_min_gap_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS last_recovery_pin_at timestamptz;
