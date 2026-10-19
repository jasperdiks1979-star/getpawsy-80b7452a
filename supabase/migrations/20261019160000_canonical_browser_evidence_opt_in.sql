-- Opt-in browser evidence repair. Does NOT run a backfill or change any scheduler.
-- Execute only after release gates and a dry-run sample have been reviewed.
-- No writes to canonical_events or visitor_activity.
CREATE OR REPLACE FUNCTION public.canonical_session_fill_browser_from_activity(
  since timestamptz,
  max_sessions integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  changed integer := 0;
BEGIN
  IF since IS NULL OR since > now() THEN
    RAISE EXCEPTION 'since must be a non-null past timestamp';
  END IF;
  IF max_sessions IS NULL OR max_sessions < 1 OR max_sessions > 100 THEN
    RAISE EXCEPTION 'max_sessions must be between 1 and 100';
  END IF;

  -- Limit session candidates BEFORE accessing activity rows.
  WITH candidates AS MATERIALIZED (
    SELECT cs.session_id, cs.first_seen_at, cs.last_seen_at
    FROM public.canonical_sessions cs
    WHERE cs.last_seen_at >= since
      AND cs.first_seen_at >= since - interval '2 hours'
      AND (cs.browser IS NULL OR btrim(cs.browser) = '')
    ORDER BY cs.last_seen_at DESC, cs.session_id
    LIMIT max_sessions
  ), evidence AS (
    SELECT c.session_id, v.browser
    FROM candidates c
    JOIN LATERAL (
      SELECT va.browser
      FROM public.visitor_activity va
      WHERE va.session_id = c.session_id
        AND va.created_at BETWEEN c.first_seen_at - interval '5 minutes'
                              AND GREATEST(c.last_seen_at, c.first_seen_at) + interval '5 minutes'
        AND va.browser IS NOT NULL
        AND btrim(va.browser) <> ''
        AND lower(btrim(va.browser)) <> 'unknown'
      ORDER BY va.created_at ASC, va.id ASC
      LIMIT 1
    ) v ON true
  ), updated AS (
    UPDATE public.canonical_sessions cs
    SET browser = e.browser, updated_at = now()
    FROM evidence e
    WHERE cs.session_id = e.session_id
      AND (cs.browser IS NULL OR btrim(cs.browser) = '')
    RETURNING cs.session_id
  )
  SELECT count(*) INTO changed FROM updated;
  RETURN changed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.canonical_session_fill_browser_from_activity(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_session_fill_browser_from_activity(timestamptz, integer)
  TO service_role;

-- Intentionally no SELECT of the function here: defining it is not executing it.
-- Rollback of FUNCTION ONLY (does not undo rows already updated):
-- DROP FUNCTION IF EXISTS public.canonical_session_fill_browser_from_activity(timestamptz, integer);
