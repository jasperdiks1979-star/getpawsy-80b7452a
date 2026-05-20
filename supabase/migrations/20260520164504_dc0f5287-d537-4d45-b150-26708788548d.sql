DO $$
DECLARE
  service_key text;
  supa_url text;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  SELECT decrypted_secret INTO supa_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;

  IF service_key IS NULL OR supa_url IS NULL THEN
    RAISE NOTICE 'Skipping cron registration: vault secrets missing';
    RETURN;
  END IF;

  PERFORM cron.unschedule('growth-produce-creative-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growth-produce-creative-daily');

  PERFORM cron.schedule(
    'growth-produce-creative-daily',
    '30 6 * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      );
    $cron$, supa_url || '/functions/v1/growth-produce-creative', service_key)
  );
END $$;