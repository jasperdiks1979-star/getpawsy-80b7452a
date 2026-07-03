
-- =====================================================================
-- Real-Human Session Classifier
-- Single source of truth used by all mission KPI dashboards.
-- Excludes: bots, crawlers, smoke tests, admin/internal, prefetch,
-- Lovable preview, datacenter monitors, sessions missing browser
-- fingerprint, sub-3s bounces with NULL country/browser/OS trio.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_real_human_session(
  p_session_id      text,
  p_first_seen_at   timestamptz,
  p_last_seen_at    timestamptz,
  p_landing_page    text,
  p_referrer        text,
  p_utm_source      text,
  p_utm_medium      text,
  p_utm_campaign    text,
  p_country         text,
  p_device          text,
  p_browser         text,
  p_os              text,
  p_screen_wxh      text,
  p_tsi_is_bot      boolean,
  p_tsi_is_internal boolean,
  p_tsi_bucket      text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    -- Hard exclusions from TSI enrichment when available
    COALESCE(p_tsi_is_bot, false) = false
    AND COALESCE(p_tsi_is_internal, false) = false
    AND (p_tsi_bucket IS NULL OR p_tsi_bucket NOT IN (
      'bot','search_bot','ai_crawler','smoke_test',
      'lovable_preview','ai_worker','internal','qa'
    ))
    -- Smoke / synthetic markers on the session id or landing url
    AND COALESCE(p_session_id,'') NOT ILIKE 'atc-%'
    AND COALESCE(p_session_id,'') NOT ILIKE 'smoke-%'
    AND COALESCE(p_session_id,'') NOT ILIKE 'synthetic-%'
    AND COALESCE(p_session_id,'') NOT ILIKE 'e2e-%'
    AND COALESCE(p_landing_page,'') NOT ILIKE '%_smoke=%'
    AND COALESCE(p_landing_page,'') NOT ILIKE '%smoke_test=%'
    AND COALESCE(p_landing_page,'') NOT ILIKE '%__lovable=1%'
    -- UTM tags reserved for internal / synthetic traffic
    AND LOWER(COALESCE(p_utm_source,''))   NOT IN ('smoke','internal','admin','test','synthetic','lovable','ci')
    AND LOWER(COALESCE(p_utm_medium,''))   NOT IN ('smoke','internal','admin','test','synthetic','ci')
    AND LOWER(COALESCE(p_utm_campaign,'')) NOT ILIKE 'smoke%'
    AND LOWER(COALESCE(p_utm_campaign,'')) NOT ILIKE 'internal%'
    AND LOWER(COALESCE(p_utm_campaign,'')) NOT ILIKE 'admin%'
    -- Preview / self-referral noise
    AND COALESCE(p_referrer,'') NOT ILIKE '%lovable.app%'
    AND COALESCE(p_referrer,'') NOT ILIKE '%lovable.dev%'
    AND COALESCE(p_referrer,'') NOT ILIKE '%id-preview--%'
    -- Real-browser fingerprint required (bots present all NULL per forensics)
    AND p_browser IS NOT NULL
    AND p_device  IS NOT NULL
    AND p_country IS NOT NULL
    -- Pinterest iOS in-app prefetch fingerprint (390x844 + no country)
    AND NOT (COALESCE(p_screen_wxh,'') = '390x844'
             AND COALESCE(p_referrer,'') ILIKE '%pinterest.com%'
             AND p_country IS NULL)
    -- Sub-3s bounces with the classic "NULL trio" fingerprint
    AND NOT (
      p_last_seen_at IS NOT NULL
      AND p_first_seen_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (p_last_seen_at - p_first_seen_at)) < 3
      AND p_browser IS NULL AND p_device IS NULL AND p_os IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_real_human_session(
  text, timestamptz, timestamptz, text, text, text, text, text, text,
  text, text, text, text, boolean, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_real_human_session(
  text, timestamptz, timestamptz, text, text, text, text, text, text,
  text, text, text, text, boolean, boolean, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- View: real_human_sessions  (SECURITY INVOKER — respects RLS on base)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.real_human_sessions CASCADE;

CREATE VIEW public.real_human_sessions
WITH (security_invoker = true)
AS
SELECT
  cs.session_id,
  cs.visitor_id,
  cs.first_seen_at,
  cs.last_seen_at,
  cs.landing_page,
  cs.referrer,
  cs.utm_source,
  cs.utm_medium,
  cs.utm_campaign,
  cs.country,
  cs.device,
  cs.browser,
  cs.os,
  cs.screen_wxh,
  cs.classified_channel,
  cs.order_id,
  cs.last_stage,
  te.bucket        AS tsi_bucket,
  te.classification AS tsi_classification,
  te.confidence    AS tsi_confidence
FROM public.canonical_sessions cs
LEFT JOIN public.tsi_session_enrichment te
  ON te.session_id = cs.session_id
WHERE public.is_real_human_session(
  cs.session_id,
  cs.first_seen_at,
  cs.last_seen_at,
  cs.landing_page,
  cs.referrer,
  cs.utm_source,
  cs.utm_medium,
  cs.utm_campaign,
  cs.country,
  cs.device,
  cs.browser,
  cs.os,
  cs.screen_wxh,
  te.is_bot,
  te.is_internal,
  te.bucket
);

GRANT SELECT ON public.real_human_sessions TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- View: real_human_sessions_counters_7d (dashboard summary)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.real_human_sessions_counters_7d CASCADE;

CREATE VIEW public.real_human_sessions_counters_7d
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    cs.session_id,
    cs.first_seen_at,
    cs.country,
    public.is_real_human_session(
      cs.session_id, cs.first_seen_at, cs.last_seen_at,
      cs.landing_page, cs.referrer, cs.utm_source, cs.utm_medium,
      cs.utm_campaign, cs.country, cs.device, cs.browser, cs.os,
      cs.screen_wxh, te.is_bot, te.is_internal, te.bucket
    ) AS is_human
  FROM public.canonical_sessions cs
  LEFT JOIN public.tsi_session_enrichment te ON te.session_id = cs.session_id
  WHERE cs.first_seen_at >= now() - interval '7 days'
)
SELECT
  count(*)                                              AS total_sessions_7d,
  count(*) FILTER (WHERE is_human)                      AS real_human_sessions_7d,
  count(*) FILTER (WHERE NOT is_human)                  AS excluded_sessions_7d,
  count(*) FILTER (WHERE is_human AND country IN ('US','United States')) AS real_human_us_sessions_7d
FROM base;

GRANT SELECT ON public.real_human_sessions_counters_7d TO authenticated, service_role;
