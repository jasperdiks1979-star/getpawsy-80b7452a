
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'canonical-ingest-recent-3min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'canonical-ingest-recent-3min',
  '*/3 * * * *',
  $$ SELECT public.canonical_ingest_recent(1); $$
);
