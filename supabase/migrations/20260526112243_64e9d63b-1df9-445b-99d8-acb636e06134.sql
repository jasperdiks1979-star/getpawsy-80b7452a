ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS voiceover_error jsonb,
  ADD COLUMN IF NOT EXISTS voiceover_last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_vo_error
  ON public.cinematic_ad_jobs ((voiceover_error->>'code'))
  WHERE voiceover_error IS NOT NULL;