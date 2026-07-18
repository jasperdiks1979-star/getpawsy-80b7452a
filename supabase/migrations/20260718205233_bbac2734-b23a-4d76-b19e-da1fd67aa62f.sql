
-- Commercial-eligibility view over canonical_sessions.
-- Single source of truth for "conversion-eligible human sessions".
CREATE OR REPLACE VIEW public.commercial_sessions
WITH (security_invoker = true) AS
SELECT
  cs.*,
  COALESCE(NULLIF(TRIM(cs.country), ''), 'Unknown') AS country_display
FROM public.canonical_sessions cs
WHERE cs.is_internal IS NOT TRUE
  AND cs.is_bot IS NOT TRUE
  AND cs.technical_path IS NOT TRUE
  AND cs.exclude_from_commercial IS NOT TRUE
  AND (
    cs.traffic_quality IN ('confirmed_human','probable_human','human')
    OR cs.traffic_class IN ('CONFIRMED_HUMAN','PROBABLE_HUMAN')
  );

GRANT SELECT ON public.commercial_sessions TO authenticated;
GRANT SELECT ON public.commercial_sessions TO service_role;

-- Country totals for the commercial dashboard. NULL/empty country is
-- explicitly reported as 'Unknown' — never fabricated as United States.
CREATE OR REPLACE VIEW public.commercial_country_totals_24h
WITH (security_invoker = true) AS
SELECT
  COALESCE(NULLIF(TRIM(country), ''), 'Unknown') AS country,
  COUNT(DISTINCT COALESCE(visitor_id, session_id)) AS human_visitors,
  COUNT(*) AS commercial_sessions
FROM public.commercial_sessions
WHERE first_seen_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY human_visitors DESC;

GRANT SELECT ON public.commercial_country_totals_24h TO authenticated;
GRANT SELECT ON public.commercial_country_totals_24h TO service_role;
