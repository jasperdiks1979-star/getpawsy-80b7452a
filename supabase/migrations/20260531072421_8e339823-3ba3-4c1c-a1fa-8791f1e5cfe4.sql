
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS motion_quality_score integer,
  ADD COLUMN IF NOT EXISTS scene_consistency_score integer;

UPDATE public.cinematic_ad_settings
  SET min_product_fidelity_score = 90
  WHERE min_product_fidelity_score IS NULL OR min_product_fidelity_score > 90;

ALTER TABLE public.cinematic_ad_settings
  ALTER COLUMN min_product_fidelity_score SET DEFAULT 90;
