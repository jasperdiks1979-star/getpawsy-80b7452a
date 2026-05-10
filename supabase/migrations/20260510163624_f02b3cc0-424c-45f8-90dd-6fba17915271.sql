ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS quality_threshold NUMERIC(5,2) NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS max_render_retries INT NOT NULL DEFAULT 1;

ALTER TABLE public.pinterest_runtime_settings
  DROP CONSTRAINT IF EXISTS pinterest_runtime_settings_quality_threshold_check;
ALTER TABLE public.pinterest_runtime_settings
  ADD CONSTRAINT pinterest_runtime_settings_quality_threshold_check
  CHECK (quality_threshold >= 0 AND quality_threshold <= 100);

ALTER TABLE public.pinterest_runtime_settings
  DROP CONSTRAINT IF EXISTS pinterest_runtime_settings_max_render_retries_check;
ALTER TABLE public.pinterest_runtime_settings
  ADD CONSTRAINT pinterest_runtime_settings_max_render_retries_check
  CHECK (max_render_retries >= 0 AND max_render_retries <= 4);