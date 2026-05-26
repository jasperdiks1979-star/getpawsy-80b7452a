ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS has_vo boolean
  GENERATED ALWAYS AS (voiceover_url IS NOT NULL OR vo_url IS NOT NULL) STORED;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_has_vo ON public.cinematic_ad_jobs(has_vo);