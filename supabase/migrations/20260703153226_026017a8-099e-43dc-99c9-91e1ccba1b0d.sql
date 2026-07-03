
CREATE OR REPLACE FUNCTION public.is_real_human_session(
  p_session_id text, p_first_seen_at timestamptz, p_last_seen_at timestamptz,
  p_landing_page text, p_referrer text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text,
  p_country text, p_device text, p_browser text, p_os text, p_screen_wxh text,
  p_tsi_is_bot boolean, p_tsi_is_internal boolean, p_tsi_bucket text
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
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
    AND LOWER(COALESCE(p_referrer,'')) NOT ILIKE '%lovable.app%'
    AND LOWER(COALESCE(p_referrer,'')) NOT ILIKE '%lovable.dev%'
    AND LOWER(COALESCE(p_referrer,'')) NOT ILIKE '%id-preview--%'
    AND p_country IS NOT NULL
    AND p_device  IS NOT NULL
    AND UPPER(p_country) NOT IN ('NL','THE NETHERLANDS','NETHERLANDS')
    AND NOT (COALESCE(p_screen_wxh,'') = '390x844'
             AND LOWER(COALESCE(p_referrer,'')) ILIKE '%pinterest.com%')
    -- Phase 17: reject "empty fingerprint" bots.
    -- A real browser exposes at least ONE of browser / os / screen size.
    -- If none are present, we also require either a real referrer / UTM
    -- OR at least 3s of session duration. Otherwise: bot.
    AND (
      COALESCE(p_browser,'')    <> ''
      OR COALESCE(p_os,'')      <> ''
      OR COALESCE(p_screen_wxh,'') <> ''
      OR COALESCE(p_referrer,'') <> ''
      OR COALESCE(p_utm_source,'') <> ''
      OR (p_first_seen_at IS NOT NULL AND p_last_seen_at IS NOT NULL
          AND (p_last_seen_at - p_first_seen_at) >= interval '3 seconds')
    )
$$;
