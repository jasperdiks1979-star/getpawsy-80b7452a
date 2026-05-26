
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS text_safe_area_passed boolean,
  ADD COLUMN IF NOT EXISTS category_match_passed boolean,
  ADD COLUMN IF NOT EXISTS creative_quality_score numeric,
  ADD COLUMN IF NOT EXISTS creative_reject_reason text;

ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS creative_quality_min_score numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS motion_score_min_threshold numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS category_match_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS text_safe_area_required boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_creative_quality
  ON public.cinematic_ad_jobs (creative_quality_score)
  WHERE creative_quality_score IS NOT NULL;
