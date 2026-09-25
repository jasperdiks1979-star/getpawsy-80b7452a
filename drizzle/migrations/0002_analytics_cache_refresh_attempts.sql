ALTER TABLE public.analytics_canonical_cache
  ADD COLUMN IF NOT EXISTS last_refresh_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_refresh_status text,
  ADD COLUMN IF NOT EXISTS last_refresh_finished_at timestamptz;
COMMENT ON COLUMN public.analytics_canonical_cache.last_refresh_status IS 'running | ok | error. running with an expired locked_until = worker died (e.g. CPU limit) without committing.';