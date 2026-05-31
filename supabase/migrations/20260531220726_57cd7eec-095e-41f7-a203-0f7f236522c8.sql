
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS motion_storyboard jsonb,
  ADD COLUMN IF NOT EXISTS motion_ratio numeric(4,3),
  ADD COLUMN IF NOT EXISTS motion_engine_version text,
  ADD COLUMN IF NOT EXISTS pinterest_perf_score integer,
  ADD COLUMN IF NOT EXISTS pinterest_perf_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS selected_voice_id text,
  ADD COLUMN IF NOT EXISTS voice_fit_score integer,
  ADD COLUMN IF NOT EXISTS voice_alt_id text;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_motion_ratio
  ON public.cinematic_ad_jobs (motion_ratio DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_pinterest_perf
  ON public.cinematic_ad_jobs (pinterest_perf_score DESC NULLS LAST);
