SELECT net.http_post(
  url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
  body := '{"tier":"d14"}'::jsonb,
  timeout_milliseconds := 300000);

SELECT net.http_post(
  url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
  body := '{"tier":"d30"}'::jsonb,
  timeout_milliseconds := 300000);

SELECT net.http_post(
  url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', current_setting('app.internal_function_secret', true)),
  body := '{"tier":"d90"}'::jsonb,
  timeout_milliseconds := 300000);