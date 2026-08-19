-- Cron -> analytics-canonical-warmer auth repair.
-- The jobs injected current_setting('app.internal_function_secret', true), a GUC that was
-- never defined, so the x-internal-secret header was empty and the warmer rejected every
-- call with 401. Custom GUCs cannot be persisted with our privileges (ALTER DATABASE /
-- ALTER ROLE both return 42501), so the database-side credential lives in a dedicated
-- schema that is NOT exposed through the Data API instead.
CREATE SCHEMA IF NOT EXISTS internal_config;

REVOKE ALL ON SCHEMA internal_config FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS internal_config.warmer_auth (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No grants at all: only superuser/owner (the role pg_cron executes as) can read this.
REVOKE ALL ON internal_config.warmer_auth FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE internal_config.warmer_auth ENABLE ROW LEVEL SECURITY;

INSERT INTO internal_config.warmer_auth (key, value)
VALUES ('analytics_warmer_secret', 'TGmFyhpEJ95M6Un9XHcxUwlwuJZ6N4jBvnk1N0gDGf1OkQWf')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

SELECT cron.alter_job(
  job_id := 339,
  command := $cmd$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',
      (SELECT value FROM internal_config.warmer_auth WHERE key = 'analytics_warmer_secret')),
    body := '{"tier":"hot"}'::jsonb,
    timeout_milliseconds := 15000);
  $cmd$
);

SELECT cron.alter_job(
  job_id := 340,
  command := $cmd$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',
      (SELECT value FROM internal_config.warmer_auth WHERE key = 'analytics_warmer_secret')),
    body := '{"tier":"d14"}'::jsonb,
    timeout_milliseconds := 15000);
  $cmd$
);

SELECT cron.alter_job(
  job_id := 341,
  command := $cmd$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',
      (SELECT value FROM internal_config.warmer_auth WHERE key = 'analytics_warmer_secret')),
    body := '{"tier":"d30"}'::jsonb,
    timeout_milliseconds := 15000);
  $cmd$
);

SELECT cron.alter_job(
  job_id := 342,
  command := $cmd$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',
      (SELECT value FROM internal_config.warmer_auth WHERE key = 'analytics_warmer_secret')),
    body := '{"tier":"d90"}'::jsonb,
    timeout_milliseconds := 15000);
  $cmd$
);