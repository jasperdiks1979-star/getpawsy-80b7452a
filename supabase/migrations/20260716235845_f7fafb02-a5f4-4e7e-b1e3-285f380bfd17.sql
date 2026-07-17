
-- ============================================================
-- 1. normalize_country
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_country(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := btrim(coalesce(p, ''));
BEGIN
  IF s = '' OR s = '??' OR lower(s) IN ('unknown', 'null', 'n/a', '-') THEN
    RETURN 'Unknown';
  END IF;
  -- Common ISO / alias normalization; pass through everything else verbatim.
  RETURN CASE upper(s)
    WHEN 'US'  THEN 'United States'
    WHEN 'USA' THEN 'United States'
    WHEN 'UNITED STATES OF AMERICA' THEN 'United States'
    WHEN 'UNITED STATES' THEN 'United States'
    WHEN 'NL'  THEN 'Netherlands'
    WHEN 'NLD' THEN 'Netherlands'
    WHEN 'NETHERLANDS' THEN 'Netherlands'
    WHEN 'GB'  THEN 'United Kingdom'
    WHEN 'UK'  THEN 'United Kingdom'
    WHEN 'GBR' THEN 'United Kingdom'
    WHEN 'UNITED KINGDOM' THEN 'United Kingdom'
    WHEN 'DE'  THEN 'Germany'
    WHEN 'DEU' THEN 'Germany'
    WHEN 'FR'  THEN 'France'
    WHEN 'FRA' THEN 'France'
    WHEN 'CA'  THEN 'Canada'
    WHEN 'CAN' THEN 'Canada'
    WHEN 'AU'  THEN 'Australia'
    WHEN 'AUS' THEN 'Australia'
    ELSE s
  END;
END;
$$;

-- ============================================================
-- 2. classify_channel_v2 — 12-step ordered classifier
--    Returns jsonb: { traffic_class, channel, is_internal,
--                     exclude_from_commercial, reason, bot_name }
-- ============================================================
CREATE OR REPLACE FUNCTION public.classify_channel_v2(
  p_referrer     text,
  p_utm_source   text,
  p_utm_medium   text,
  p_user_agent   text DEFAULT NULL,
  p_landing_path text DEFAULT NULL,
  p_query_string text DEFAULT NULL,
  p_click_ids    jsonb DEFAULT '{}'::jsonb,
  p_has_js_evidence boolean DEFAULT NULL,
  p_has_interaction boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  ref text := lower(coalesce(p_referrer, ''));
  src text := lower(coalesce(p_utm_source, ''));
  med text := lower(coalesce(p_utm_medium, ''));
  ua  text := lower(coalesce(p_user_agent, ''));
  path text := lower(coalesce(p_landing_path, ''));
  qry text := lower(coalesce(p_query_string, ''));
  ids jsonb := coalesce(p_click_ids, '{}'::jsonb);
  is_bot boolean := false;
  bot_name text := NULL;
  paid boolean;
BEGIN
  -- Normalize the "direct/(none)" GA4 sentinel to empty.
  IF src = 'direct' AND med IN ('(none)', 'none', '') THEN
    src := ''; med := '';
  END IF;

  paid := (med IN ('cpc','ppc','paid','paidsocial','paid_social','display','banner','cpm','retargeting','shopping'))
          OR (ids ? 'gclid') OR (ids ? 'fbclid') OR (ids ? 'msclkid');

  -- ── Step 1: internal Lovable preview ──────────────────────
  IF ref LIKE '%lovable.dev%' OR ref LIKE '%lovable.app%'
     OR ref LIKE '%lovableproject.com%' OR ref LIKE '%gptengineer.app%'
     OR qry LIKE '%__lovable_sha=%' OR qry LIKE '%__lovable_load_id=%'
     OR qry LIKE '%forcehidebadge=true%'
  THEN
    RETURN jsonb_build_object(
      'traffic_class','INTERNAL_PREVIEW',
      'channel','internal_preview',
      'is_internal', true,
      'exclude_from_commercial', true,
      'reason','lovable_preview_signal'
    );
  END IF;

  -- ── Step 2: known internal automation (signed-header rows land
  --           here via ingest; this branch also catches obvious UAs).
  IF ua LIKE '%getpawsy-automation%' OR ua LIKE '%getpawsy-internal%'
     OR ua LIKE '%getpawsy verify%' OR ua LIKE '%getpawsy check%'
  THEN
    RETURN jsonb_build_object(
      'traffic_class','INTERNAL_AUTOMATION',
      'channel','internal_automation',
      'is_internal', true,
      'exclude_from_commercial', true,
      'reason','automation_user_agent'
    );
  END IF;

  -- ── Step 3: known crawlers / bots ─────────────────────────
  IF ua ~ 'googlebot|adsbot-google|google-inspectiontool|google-read-aloud' THEN
    is_bot := true; bot_name := 'Googlebot';
  ELSIF ua ~ 'bingbot|adidxbot' THEN is_bot := true; bot_name := 'Bingbot';
  ELSIF ua LIKE '%duckduckbot%'  THEN is_bot := true; bot_name := 'DuckDuckBot';
  ELSIF ua LIKE '%yandexbot%'    THEN is_bot := true; bot_name := 'YandexBot';
  ELSIF ua LIKE '%baiduspider%'  THEN is_bot := true; bot_name := 'Baiduspider';
  ELSIF ua LIKE '%ahrefsbot%'    THEN is_bot := true; bot_name := 'AhrefsBot';
  ELSIF ua LIKE '%semrushbot%'   THEN is_bot := true; bot_name := 'SemrushBot';
  ELSIF ua LIKE '%mj12bot%'      THEN is_bot := true; bot_name := 'MJ12bot';
  ELSIF ua LIKE '%dotbot%'       THEN is_bot := true; bot_name := 'DotBot';
  ELSIF ua LIKE '%applebot%'     THEN is_bot := true; bot_name := 'Applebot';
  END IF;
  IF is_bot THEN
    RETURN jsonb_build_object(
      'traffic_class','BOT_CONFIRMED',
      'channel','crawler',
      'is_internal', true,
      'exclude_from_commercial', true,
      'reason','known_crawler_ua',
      'bot_name', bot_name
    );
  END IF;

  -- ── Step 4: Pinterest / social preview verifiers ──────────
  IF ua LIKE '%pinterest%' AND (ua LIKE '%bot%' OR ua LIKE '%link%' OR ua LIKE '%preview%' OR ua LIKE '%verify%') THEN
    RETURN jsonb_build_object(
      'traffic_class','VERIFIER','channel','pinterest_verifier',
      'is_internal', true,'exclude_from_commercial', true,
      'reason','pinterest_verifier_ua','bot_name','Pinterestbot'
    );
  END IF;
  IF ua ~ 'facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|redditbot|whatsapp|telegrambot' THEN
    RETURN jsonb_build_object(
      'traffic_class','VERIFIER','channel','social_verifier',
      'is_internal', true,'exclude_from_commercial', true,
      'reason','social_preview_ua'
    );
  END IF;

  -- ── Step 5: uptime / health monitors ──────────────────────
  IF ua ~ 'uptimerobot|pingdom|statuscake|newrelic|datadog|site24x7|betteruptime|freshping|hetrixtools' THEN
    RETURN jsonb_build_object(
      'traffic_class','UPTIME_MONITOR','channel','uptime_monitor',
      'is_internal', true,'exclude_from_commercial', true,
      'reason','uptime_monitor_ua'
    );
  END IF;

  -- ── Step 6: prerender / prefetch / headless ───────────────
  IF ua ~ 'prerender|headlesschrome|puppeteer|playwright|phantomjs|slimerjs|selenium' THEN
    RETURN jsonb_build_object(
      'traffic_class','PRERENDER','channel','prerender',
      'is_internal', true,'exclude_from_commercial', true,
      'reason','headless_ua'
    );
  END IF;

  -- ── Step 7: paid campaigns ────────────────────────────────
  IF ids ? 'ttclid' THEN RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','tiktok_ads','is_internal',false,'exclude_from_commercial',false,'reason','ttclid'); END IF;
  IF ids ? 'gclid'  THEN RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','google_ads','is_internal',false,'exclude_from_commercial',false,'reason','gclid'); END IF;
  IF ids ? 'msclkid' THEN RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','bing_ads','is_internal',false,'exclude_from_commercial',false,'reason','msclkid'); END IF;
  IF (ids ? 'pinterest_click_id') OR (src='pinterest' AND paid) THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','pinterest_ads','is_internal',false,'exclude_from_commercial',false,'reason','pinterest_click_id');
  END IF;
  IF ids ? 'fbclid' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel',
      CASE WHEN src LIKE '%instagram%' OR ref LIKE '%instagram%' THEN 'instagram_ads' ELSE 'facebook_ads' END,
      'is_internal',false,'exclude_from_commercial',false,'reason','fbclid');
  END IF;

  -- ── Step 8/9: organic social + search ─────────────────────
  IF src IN ('pinterest','pin','pinterest.com') OR ref LIKE '%pinterest.%' OR ref LIKE '%pin.it%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','pinterest_organic','is_internal',false,'exclude_from_commercial',false,'reason','pinterest_referrer');
  END IF;
  IF src IN ('google','google.com') OR ref LIKE '%google.%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','google_organic','is_internal',false,'exclude_from_commercial',false,'reason','google_referrer');
  END IF;
  IF src IN ('bing','bing.com') OR ref LIKE '%bing.%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','bing_organic','is_internal',false,'exclude_from_commercial',false,'reason','bing_referrer');
  END IF;
  IF ref LIKE '%duckduckgo.%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','duckduckgo_organic','is_internal',false,'exclude_from_commercial',false,'reason','ddg_referrer');
  END IF;
  IF ref LIKE '%facebook.%' OR ref LIKE '%m.facebook.%' OR ref LIKE '%fb.com%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','facebook_organic','is_internal',false,'exclude_from_commercial',false,'reason','fb_referrer');
  END IF;
  IF ref LIKE '%instagram.%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','instagram_organic','is_internal',false,'exclude_from_commercial',false,'reason','ig_referrer');
  END IF;
  IF ref LIKE '%tiktok.%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','tiktok_organic','is_internal',false,'exclude_from_commercial',false,'reason','tt_referrer');
  END IF;
  IF ref LIKE '%reddit.%' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','reddit_organic','is_internal',false,'exclude_from_commercial',false,'reason','reddit_referrer');
  END IF;

  -- ── Step 10: referral ─────────────────────────────────────
  IF ref <> '' THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_PROBABLE','channel','referral','is_internal',false,'exclude_from_commercial',false,'reason','other_referrer');
  END IF;

  -- ── Step 11: human direct — requires positive human evidence.
  IF p_has_interaction IS TRUE OR (p_has_js_evidence IS TRUE AND ua <> '' AND ua NOT LIKE '%bot%') THEN
    RETURN jsonb_build_object('traffic_class','HUMAN_CONFIRMED','channel','direct','is_internal',false,'exclude_from_commercial',false,'reason','human_evidence_direct');
  END IF;

  -- ── Step 12: unknown (NO fallback to direct) ──────────────
  RETURN jsonb_build_object(
    'traffic_class','UNKNOWN',
    'channel','unknown',
    'is_internal', false,
    'exclude_from_commercial', true,
    'reason','no_signal_no_evidence'
  );
END;
$$;

-- ============================================================
-- 3. canonical_sessions v2 columns (nullable, backfilled by trigger)
-- ============================================================
ALTER TABLE public.canonical_sessions
  ADD COLUMN IF NOT EXISTS traffic_class            text,
  ADD COLUMN IF NOT EXISTS is_internal              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_from_commercial  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classification_reason    text,
  ADD COLUMN IF NOT EXISTS bot_name                 text,
  ADD COLUMN IF NOT EXISTS classifier_version       text;

CREATE INDEX IF NOT EXISTS canonical_sessions_traffic_class_idx
  ON public.canonical_sessions (traffic_class);
CREATE INDEX IF NOT EXISTS canonical_sessions_exclude_commercial_idx
  ON public.canonical_sessions (exclude_from_commercial)
  WHERE exclude_from_commercial = false;

-- ============================================================
-- 4. Upgrade the existing session trigger to populate v2 too
--    (keeps legacy classified_channel intact for backward compat)
-- ============================================================
CREATE OR REPLACE FUNCTION public.canonical_sessions_set_classified_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  eff_ref  text := COALESCE(NULLIF(NEW.first_referrer, ''), NEW.referrer);
  eff_src  text := COALESCE(NULLIF(NEW.first_utm_source, ''), NEW.utm_source);
  eff_med  text := COALESCE(NULLIF(NEW.first_utm_medium, ''), NEW.utm_medium);
  ids jsonb := '{}'::jsonb;
  v2 jsonb;
BEGIN
  IF NEW.first_gclid              IS NOT NULL THEN ids := ids || jsonb_build_object('gclid', NEW.first_gclid); END IF;
  IF NEW.first_fbclid             IS NOT NULL THEN ids := ids || jsonb_build_object('fbclid', NEW.first_fbclid); END IF;
  IF NEW.first_ttclid             IS NOT NULL THEN ids := ids || jsonb_build_object('ttclid', NEW.first_ttclid); END IF;
  IF NEW.first_msclkid            IS NOT NULL THEN ids := ids || jsonb_build_object('msclkid', NEW.first_msclkid); END IF;
  IF NEW.first_pinterest_click_id IS NOT NULL THEN ids := ids || jsonb_build_object('pinterest_click_id', NEW.first_pinterest_click_id); END IF;
  IF NEW.first_reddit_click_id    IS NOT NULL THEN ids := ids || jsonb_build_object('reddit_click_id', NEW.first_reddit_click_id); END IF;

  -- Legacy classifier (unchanged behavior for existing views/callers)
  NEW.classified_channel := public.classify_traffic_source(eff_ref, eff_src, eff_med, ids);

  -- v2 classifier — populates the new columns; is_internal / bot_name / etc.
  v2 := public.classify_channel_v2(
    eff_ref, eff_src, eff_med,
    NULL,                    -- user_agent not stored on sessions today; ingest will pass it in Phase 4
    NEW.first_landing_path,
    NULL,                    -- query_string not stored on sessions today
    ids,
    NULL, NULL
  );
  NEW.traffic_class           := v2->>'traffic_class';
  NEW.is_internal             := (v2->>'is_internal')::boolean;
  NEW.exclude_from_commercial := (v2->>'exclude_from_commercial')::boolean;
  NEW.classification_reason   := v2->>'reason';
  NEW.bot_name                := v2->>'bot_name';
  NEW.classifier_version      := 'v2';

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Commercial view — human sessions only, normalized country.
--    Phase 6 dashboards will opt into this view.
-- ============================================================
CREATE OR REPLACE VIEW public.canonical_commercial_sessions_v2 AS
SELECT
  cs.session_id,
  cs.visitor_id,
  cs.first_seen_at,
  cs.last_seen_at,
  public.normalize_country(cs.country) AS country,
  cs.device,
  cs.classified_channel,
  cs.traffic_class,
  cs.classification_reason,
  cs.classifier_version,
  cs.utm_source,
  cs.utm_medium,
  cs.utm_campaign,
  cs.order_id,
  cs.last_stage
FROM public.canonical_sessions cs
WHERE cs.exclude_from_commercial = false
  AND cs.is_internal = false
  AND (cs.traffic_class IN ('HUMAN_CONFIRMED', 'HUMAN_PROBABLE') OR cs.traffic_class IS NULL);

GRANT SELECT ON public.canonical_commercial_sessions_v2 TO authenticated;
GRANT ALL    ON public.canonical_commercial_sessions_v2 TO service_role;

-- ============================================================
-- 6. Backfill traffic_class for existing rows using the v2 classifier.
--    Sessions with no telemetry become UNKNOWN, never HUMAN or direct.
-- ============================================================
UPDATE public.canonical_sessions cs
SET
  traffic_class           = v2.tc,
  is_internal             = v2.internal,
  exclude_from_commercial = v2.excl,
  classification_reason   = v2.reason,
  bot_name                = v2.bot_name,
  classifier_version      = 'v2'
FROM (
  SELECT
    session_id,
    (classify_channel_v2(
       COALESCE(NULLIF(first_referrer,''), referrer),
       COALESCE(NULLIF(first_utm_source,''), utm_source),
       COALESCE(NULLIF(first_utm_medium,''), utm_medium),
       NULL, first_landing_path, NULL,
       (CASE WHEN first_gclid IS NOT NULL THEN jsonb_build_object('gclid',first_gclid) ELSE '{}'::jsonb END)
       || (CASE WHEN first_fbclid IS NOT NULL THEN jsonb_build_object('fbclid',first_fbclid) ELSE '{}'::jsonb END)
       || (CASE WHEN first_ttclid IS NOT NULL THEN jsonb_build_object('ttclid',first_ttclid) ELSE '{}'::jsonb END)
       || (CASE WHEN first_msclkid IS NOT NULL THEN jsonb_build_object('msclkid',first_msclkid) ELSE '{}'::jsonb END)
       || (CASE WHEN first_pinterest_click_id IS NOT NULL THEN jsonb_build_object('pinterest_click_id',first_pinterest_click_id) ELSE '{}'::jsonb END),
       NULL, NULL
    )) AS r
  FROM public.canonical_sessions
  WHERE classifier_version IS NULL
) src
CROSS JOIN LATERAL (
  SELECT
    src.r->>'traffic_class' AS tc,
    (src.r->>'is_internal')::boolean AS internal,
    (src.r->>'exclude_from_commercial')::boolean AS excl,
    src.r->>'reason' AS reason,
    src.r->>'bot_name' AS bot_name
) v2
WHERE cs.session_id = src.session_id;
