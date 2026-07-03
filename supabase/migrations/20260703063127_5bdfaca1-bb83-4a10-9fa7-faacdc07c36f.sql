
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
    COALESCE(p_tsi_is_bot, false) = false
    AND COALESCE(p_tsi_is_internal, false) = false
    AND (p_tsi_bucket IS NULL OR p_tsi_bucket NOT IN (
      'bot','search_bot','ai_crawler','smoke_test',
      'lovable_preview','ai_worker','internal','qa'
    ))
    AND COALESCE(p_session_id,'') NOT ILIKE 'atc-%'
    AND COALESCE(p_session_id,'') NOT ILIKE 'smoke-%'
    AND COALESCE(p_session_id,'') NOT ILIKE 'synthetic-%'
    AND COALESCE(p_session_id,'') NOT ILIKE 'e2e-%'
    AND COALESCE(p_landing_page,'') NOT ILIKE '%_smoke=%'
    AND COALESCE(p_landing_page,'') NOT ILIKE '%smoke_test=%'
    AND COALESCE(p_landing_page,'') NOT ILIKE '%__lovable=1%'
    AND LOWER(COALESCE(p_utm_source,''))   NOT IN ('smoke','internal','admin','test','synthetic','lovable','ci')
    AND LOWER(COALESCE(p_utm_medium,''))   NOT IN ('smoke','internal','admin','test','synthetic','ci')
    AND LOWER(COALESCE(p_utm_campaign,'')) NOT ILIKE 'smoke%'
    AND LOWER(COALESCE(p_utm_campaign,'')) NOT ILIKE 'internal%'
    AND LOWER(COALESCE(p_utm_campaign,'')) NOT ILIKE 'admin%'
    AND COALESCE(p_referrer,'') NOT ILIKE '%lovable.app%'
    AND COALESCE(p_referrer,'') NOT ILIKE '%lovable.dev%'
    AND COALESCE(p_referrer,'') NOT ILIKE '%id-preview--%'
    -- Real-visitor fingerprint (country + device required; browser field
    -- is rarely populated server-side so intentionally not enforced).
    AND p_country IS NOT NULL
    AND p_device  IS NOT NULL
    -- Pinterest iOS in-app prefetch fingerprint
    AND NOT (COALESCE(p_screen_wxh,'') = '390x844'
             AND COALESCE(p_referrer,'') ILIKE '%pinterest.com%')
    -- Sub-3s NULL-trio bounce fingerprint
    AND NOT (
      p_last_seen_at IS NOT NULL
      AND p_first_seen_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (p_last_seen_at - p_first_seen_at)) < 3
      AND p_browser IS NULL AND p_device IS NULL AND p_os IS NULL
    )
    -- Netherlands = founder / admin locale, exclude from mission KPIs
    AND UPPER(COALESCE(p_country,'')) NOT IN ('NL','THE NETHERLANDS','NETHERLANDS');
$$;
