-- Tiered cache-warming schedules for the Visitor World Map Pro.
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'analytics-canonical-warmer-5min',
    'analytics-canonical-warmer-hot',
    'analytics-canonical-warmer-14d',
    'analytics-canonical-warmer-30d',
    'analytics-canonical-warmer-90d'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule('analytics-canonical-warmer-hot', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
    body := '{"tier":"hot"}'::jsonb);
$$);

SELECT cron.schedule('analytics-canonical-warmer-14d', '2-59/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
    body := '{"tier":"d14"}'::jsonb);
$$);

SELECT cron.schedule('analytics-canonical-warmer-30d', '4-59/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
    body := '{"tier":"d30"}'::jsonb);
$$);

SELECT cron.schedule('analytics-canonical-warmer-90d', '7-59/30 * * * *', $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
    body := '{"tier":"d90"}'::jsonb);
$$);