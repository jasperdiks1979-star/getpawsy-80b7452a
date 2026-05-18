
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS ai_decisions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS autopilot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopilot_threshold integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopilot_log jsonb NOT NULL DEFAULT '[]'::jsonb;
