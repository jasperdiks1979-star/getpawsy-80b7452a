
ALTER TABLE public.cinematic_runway_jobs
  ADD COLUMN IF NOT EXISTS product_reference_urls text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS product_lock jsonb,
  ADD COLUMN IF NOT EXISTS product_lock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prompt_lock_violations jsonb;

UPDATE public.cinematic_ad_settings
  SET min_product_fidelity_score = 95
  WHERE min_product_fidelity_score < 95;
