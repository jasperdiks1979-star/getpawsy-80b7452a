-- Generate + persist the shared cron secret if not already present.
-- Value is only readable by the postgres/superuser (RLS blocks all app roles).
INSERT INTO public.app_config(key, value)
VALUES ('hero_publish_cron_secret', to_jsonb(encode(gen_random_bytes(32), 'hex')))
ON CONFLICT (key) DO NOTHING;

-- Idempotent: drop any prior schedule with the same name.
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'hero-daily-publish';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'hero-daily-publish',
  '10 14 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/hero-daily-publish',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc',
      'x-cron-secret', (SELECT value #>> '{}' FROM public.app_config WHERE key = 'hero_publish_cron_secret')
    ),
    body := jsonb_build_object('triggered_by','pg_cron','at', now())
  );
  $cron$
);