
-- Add cancel_requested column to job_runs for cooperative cancellation
ALTER TABLE public.job_runs ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_runs ADD COLUMN IF NOT EXISTS cancel_reason text;
