ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS queue_wait_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_wait_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_wait_reason text;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_queue_waiting
  ON public.cinematic_ad_jobs (queue_wait_next_at)
  WHERE status = 'queue_waiting';