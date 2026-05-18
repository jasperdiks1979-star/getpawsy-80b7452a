ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS preset text NOT NULL DEFAULT 'pin-organic',
  ADD COLUMN IF NOT EXISTS validation_report jsonb,
  ADD COLUMN IF NOT EXISTS motion_score numeric,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_preset ON public.cinematic_ad_jobs(preset);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_approved_at ON public.cinematic_ad_jobs(approved_at);