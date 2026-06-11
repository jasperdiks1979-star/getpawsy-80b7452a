ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS per_category_daily_cap integer NOT NULL DEFAULT 8;

UPDATE public.pinterest_runtime_settings
SET daily_pin_cap = 20,
    per_category_daily_cap = 8,
    us_score_threshold = 0.40,
    min_gap_minutes = 45,
    updated_at = now()
WHERE id = 1;