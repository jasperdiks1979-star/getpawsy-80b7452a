CREATE TABLE IF NOT EXISTS public.analytics_canonical_cache (
  cache_key text PRIMARY KEY,
  hours integer NOT NULL,
  geo text NOT NULL,
  envelope text NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  compute_ms integer,
  locked_until timestamptz,
  refresh_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.analytics_canonical_cache TO service_role;

ALTER TABLE public.analytics_canonical_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS analytics_canonical_cache_generated_idx
  ON public.analytics_canonical_cache (generated_at DESC);

DO $$
BEGIN
  PERFORM cron.unschedule('analytics-canonical-warmer-5min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-canonical-warmer-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'analytics-canonical-warmer-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-internal-secret', current_setting('app.internal_function_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);