-- Backstop cron: keep first-touch attribution fresh on canonical_sessions.
-- The canonical-ingest edge function already calls this RPC, but it depends
-- on the ingest cron actually firing. This DB-level job is a safety net so
-- first_utm_* / first_referrer / classified_channel are always populated.
DO $$
BEGIN
  PERFORM cron.unschedule('canonical-session-attribution-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'canonical-session-attribution-5min',
  '*/5 * * * *',
  $$SELECT public.canonical_session_refresh_with_attribution(now() - interval '2 hours');$$
);