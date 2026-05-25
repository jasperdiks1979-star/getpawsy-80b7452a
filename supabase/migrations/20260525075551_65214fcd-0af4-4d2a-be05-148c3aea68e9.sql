
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS pin_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS product_url text;

ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS worker_health_url text;
