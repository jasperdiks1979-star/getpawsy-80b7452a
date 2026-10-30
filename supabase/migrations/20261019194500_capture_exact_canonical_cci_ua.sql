-- Optional release, reviewed in Safe Copy SQL lab on 2026-10-19.
-- The active SQL cron writer canonical_ingest_recent omits source_user_agent,
-- whereas canonical_events.meta.user_agent contains the original browser UA.
-- This BEFORE INSERT trigger fills the existing nullable field from EXACT
-- same-row CCI metadata without reconstructing, inferring or classifying a bot.
-- No historical backfill or cron change is performed here.
BEGIN;
CREATE OR REPLACE FUNCTION public.canonical_event_fill_ua_from_own_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.source_user_agent IS NULL
     AND NEW.source_system::text = 'cci'
     AND jsonb_typeof(NEW.meta->'user_agent') = 'string'
     AND length(btrim(NEW.meta->>'user_agent')) > 0
  THEN
    NEW.source_user_agent := NEW.meta->>'user_agent';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_canonical_events_fill_ua_on_insert ON public.canonical_events;
CREATE TRIGGER trg_canonical_events_fill_ua_on_insert
BEFORE INSERT ON public.canonical_events
FOR EACH ROW
EXECUTE FUNCTION public.canonical_event_fill_ua_from_own_meta();
COMMIT;

-- ROLLBACK (separate explicitly approved transaction):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_canonical_events_fill_ua_on_insert ON public.canonical_events;
-- DROP FUNCTION IF EXISTS public.canonical_event_fill_ua_from_own_meta();
-- COMMIT;
--
-- Existing events remain unchanged. A separately approved, bounded NULL-only
-- evidence backfill is needed for already ingested CCI records. Do not run
-- wide UPDATEs or automatically reclassify traffic.
