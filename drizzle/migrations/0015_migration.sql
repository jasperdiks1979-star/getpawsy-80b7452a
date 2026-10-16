-- Rollback: DROP FUNCTION public.session_forensics_human_window(timestamptz);
CREATE OR REPLACE FUNCTION public.session_forensics_human_window(p_since timestamptz)
RETURNS SETOF public.session_forensics
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH win AS MATERIALIZED (
    SELECT sf.* FROM public.session_forensics sf
    WHERE sf.first_seen_at >= p_since OR sf.last_seen_at >= p_since
  ),
  cand AS MATERIALIZED (
    SELECT cs.session_id, cs.first_seen_at, cs.last_seen_at, cs.landing_page, cs.referrer,
           cs.utm_source, cs.utm_medium, cs.utm_campaign, cs.country, cs.device, cs.browser,
           cs.os, cs.screen_wxh, te.is_bot, te.is_internal, te.bucket
    FROM public.canonical_sessions cs
    LEFT JOIN public.tsi_session_enrichment te ON te.session_id = cs.session_id
    WHERE cs.session_id IN (SELECT session_id FROM win)
  )
  SELECT w.* FROM win w
  WHERE w.session_id IN (
    SELECT c.session_id FROM cand c
    WHERE public.is_real_human_session(c.session_id, c.first_seen_at, c.last_seen_at, c.landing_page,
      c.referrer, c.utm_source, c.utm_medium, c.utm_campaign, c.country, c.device, c.browser,
      c.os, c.screen_wxh, c.is_bot, c.is_internal, c.bucket)
  );
$$;
REVOKE ALL ON FUNCTION public.session_forensics_human_window(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_forensics_human_window(timestamptz) TO service_role;