ALTER TABLE public.cinematic_runway_jobs
ADD COLUMN IF NOT EXISTS merge_error text,
ADD COLUMN IF NOT EXISTS merge_attempted_at timestamptz;