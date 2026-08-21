ALTER TABLE public.analytics_canonical_cache
ADD COLUMN IF NOT EXISTS locked_until timestamptz,
ADD COLUMN IF NOT EXISTS refresh_error text;

COMMENT ON COLUMN public.analytics_canonical_cache.locked_until IS 'Single-flight lock: only one worker may rebuild this cache key until this timestamp.';
COMMENT ON COLUMN public.analytics_canonical_cache.refresh_error IS 'Last refresh error message, cleared on successful refresh.';