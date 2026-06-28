
DO $$
DECLARE
  v_anon text := current_setting('app.settings.anon_key', true);
BEGIN
  -- best-effort schedule; ignore if extension/permissions unavailable
  BEGIN
    PERFORM cron.unschedule('pinterest-taste-engine-daily');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    PERFORM cron.schedule(
      'pinterest-taste-engine-daily',
      '15 3 * * *',
      $cmd$select net.http_post(
        url := 'https://hgnafqipvhkawxvbghyl.supabase.co/functions/v1/pinterest-taste-engine',
        headers := jsonb_build_object('Content-Type','application/json'),
        body := '{}'::jsonb
      );$cmd$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'taste engine cron skipped: %', SQLERRM;
  END;
END $$;
