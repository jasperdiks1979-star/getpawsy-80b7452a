ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS render_token text,
  ADD COLUMN IF NOT EXISTS render_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS render_worker_id text,
  ADD COLUMN IF NOT EXISTS render_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS output_file_size_bytes bigint;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_render_queue
  ON public.cinematic_ad_jobs (status, render_queued_at)
  WHERE status IN ('render_queued', 'rendering');