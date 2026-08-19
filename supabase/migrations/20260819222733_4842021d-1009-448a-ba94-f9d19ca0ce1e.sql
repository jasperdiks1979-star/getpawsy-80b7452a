SELECT net.http_post(
  url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
  body := jsonb_build_object('tier', t),
  timeout_milliseconds := 300000)
FROM unnest(ARRAY['hot','d14','d30','d90']) AS t;

DELETE FROM public.analytics_canonical_cache WHERE cache_key LIKE '%|%|%';