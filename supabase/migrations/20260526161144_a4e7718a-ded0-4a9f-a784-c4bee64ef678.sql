ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS duration_auto_trimmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS trim_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS trim_ffmpeg_exit_code integer,
  ADD COLUMN IF NOT EXISTS trim_workflow_run_id text;