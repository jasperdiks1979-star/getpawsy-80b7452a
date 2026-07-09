
-- 1) Patch classifier: no-signal (no referrer + no utm + no click id) → 'direct'
CREATE OR REPLACE FUNCTION public.classify_traffic_source(
  p_referrer text, p_utm_source text, p_utm_medium text, p_click_ids jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  ref text := lower(coalesce(p_referrer,''));
  raw_src text := lower(coalesce(p_utm_source,''));
  raw_med text := lower(coalesce(p_utm_medium,''));
  src text := CASE WHEN raw_src='direct' AND raw_med IN ('(none)','none','') THEN '' ELSE raw_src END;
  med text := CASE WHEN raw_src='direct' AND raw_med IN ('(none)','none','') THEN '' ELSE raw_med END;
  ids jsonb := coalesce(p_click_ids,'{}'::jsonb);
  paid boolean := (med IN ('cpc','ppc','paid','paidsocial','paid_social','display','banner','cpm','retargeting','shopping'))
                  OR (ids ? 'gclid') OR (ids ? 'fbclid') OR (ids ? 'msclkid');
BEGIN
  IF ids ? 'ttclid' THEN RETURN 'tiktok_ads'; END IF;
  IF ids ? 'gclid' THEN RETURN 'google_ads'; END IF;
  IF ids ? 'msclkid' THEN RETURN 'bing_ads'; END IF;
  IF ids ? 'fbclid' AND (src LIKE '%instagram%' OR ref LIKE '%instagram%') THEN RETURN 'instagram_ads'; END IF;
  IF ids ? 'fbclid' THEN RETURN 'facebook_ads'; END IF;
  IF (ids ? 'pinterest_click_id') OR (src='pinterest' AND paid) THEN RETURN 'pinterest_ads'; END IF;

  IF ref LIKE '%lovable.dev%' OR ref LIKE '%lovable.app%'
     OR ref LIKE '%lovableproject.com%' OR ref LIKE '%gptengineer.app%' THEN RETURN 'internal_preview'; END IF;

  IF src IN ('pinterest','pin','pinterest.com') THEN RETURN CASE WHEN paid THEN 'pinterest_ads' ELSE 'pinterest_organic' END; END IF;
  IF src IN ('google','google.com') THEN RETURN CASE WHEN paid THEN 'google_ads' ELSE 'google_organic' END; END IF;
  IF src IN ('bing','bing.com') THEN RETURN CASE WHEN paid THEN 'bing_ads' ELSE 'bing_organic' END; END IF;
  IF src IN ('duckduckgo','duckduckgo.com','ddg') THEN RETURN 'duckduckgo_organic'; END IF;
  IF src IN ('yahoo','yahoo.com') THEN RETURN 'yahoo_organic'; END IF;
  IF src IN ('tiktok','tiktok.com') THEN RETURN CASE WHEN paid THEN 'tiktok_ads' ELSE 'tiktok_organic' END; END IF;
  IF src IN ('facebook','fb','facebook.com') THEN RETURN CASE WHEN paid THEN 'facebook_ads' ELSE 'facebook_organic' END; END IF;
  IF src IN ('instagram','ig','instagram.com') THEN RETURN CASE WHEN paid THEN 'instagram_ads' ELSE 'instagram_organic' END; END IF;
  IF src IN ('linkedin','linkedin.com') THEN RETURN CASE WHEN paid THEN 'linkedin_ads' ELSE 'linkedin_organic' END; END IF;
  IF src IN ('reddit','reddit.com') THEN RETURN CASE WHEN paid THEN 'reddit_ads' ELSE 'reddit_organic' END; END IF;
  IF src IN ('youtube','youtube.com','yt') THEN RETURN 'youtube_organic'; END IF;
  IF med IN ('email','newsletter') OR src LIKE '%klaviyo%' OR src LIKE '%mailchimp%' THEN RETURN 'email_organic'; END IF;
  IF med IN ('affiliate') OR src LIKE '%affiliate%' THEN RETURN 'affiliate_paid'; END IF;

  -- Referrer-based inference when UTM is missing
  IF ref LIKE '%pinterest.%' OR ref LIKE '%pin.it%' THEN RETURN 'pinterest_organic'; END IF;
  IF ref LIKE '%google.%' THEN RETURN 'google_organic'; END IF;
  IF ref LIKE '%bing.%' THEN RETURN 'bing_organic'; END IF;
  IF ref LIKE '%duckduckgo.%' THEN RETURN 'duckduckgo_organic'; END IF;
  IF ref LIKE '%yahoo.%' THEN RETURN 'yahoo_organic'; END IF;
  IF ref LIKE '%tiktok.%' THEN RETURN 'tiktok_organic'; END IF;
  IF ref LIKE '%facebook.%' OR ref LIKE '%fb.com%' OR ref LIKE '%m.facebook.%' THEN RETURN 'facebook_organic'; END IF;
  IF ref LIKE '%instagram.%' THEN RETURN 'instagram_organic'; END IF;
  IF ref LIKE '%linkedin.%' THEN RETURN 'linkedin_organic'; END IF;
  IF ref LIKE '%reddit.%' THEN RETURN 'reddit_organic'; END IF;
  IF ref LIKE '%youtube.%' OR ref LIKE '%youtu.be%' THEN RETURN 'youtube_organic'; END IF;

  IF med IN ('referral') THEN RETURN 'referral'; END IF;

  -- No signal at all → direct (mission-aligned: never leave a real human as 'unknown')
  IF ref = '' AND src = '' AND med = '' THEN RETURN 'direct'; END IF;

  IF med = '' AND src = '' AND ref <> '' THEN RETURN 'referral'; END IF;

  RETURN 'unknown';
END;
$$;

-- 2) Class mapping: organic | paid | internal | bot | unknown
CREATE OR REPLACE FUNCTION public.classify_traffic_class(p_channel text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_channel IS NULL OR p_channel = '' THEN 'unknown'
    WHEN p_channel IN ('internal','internal_preview','admin','preview','lovable','test_order','qa') THEN 'internal'
    WHEN p_channel LIKE '%bot%' OR p_channel IN ('lighthouse','pagespeed','synthetic_monitor','ai_crawler') THEN 'bot'
    WHEN p_channel LIKE '%_ads' OR p_channel LIKE '%_paid' OR p_channel IN ('affiliate_paid','shopping_paid','unknown_paid') THEN 'paid'
    WHEN p_channel LIKE '%_organic' OR p_channel IN ('direct','referral','email_organic','youtube_organic') THEN 'organic'
    ELSE 'unknown'
  END;
$$;

-- 3) Platform helper
CREATE OR REPLACE FUNCTION public.traffic_platform_of(p_channel text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_channel LIKE 'pinterest%' THEN 'pinterest'
    WHEN p_channel LIKE 'google%'    THEN 'google'
    WHEN p_channel LIKE 'bing%'      THEN 'microsoft'
    WHEN p_channel LIKE 'duckduckgo%'THEN 'duckduckgo'
    WHEN p_channel LIKE 'yahoo%'     THEN 'yahoo'
    WHEN p_channel LIKE 'tiktok%'    THEN 'tiktok'
    WHEN p_channel LIKE 'facebook%'  THEN 'meta'
    WHEN p_channel LIKE 'instagram%' THEN 'meta'
    WHEN p_channel LIKE 'linkedin%'  THEN 'linkedin'
    WHEN p_channel LIKE 'reddit%'    THEN 'reddit'
    WHEN p_channel LIKE 'youtube%'   THEN 'youtube'
    WHEN p_channel LIKE 'email%'     THEN 'email'
    WHEN p_channel IN ('affiliate_paid') THEN 'affiliate'
    WHEN p_channel = 'direct'        THEN 'direct'
    WHEN p_channel = 'referral'      THEN 'referral'
    WHEN p_channel IN ('internal','internal_preview','admin','preview','lovable','test_order','qa') THEN 'internal'
    ELSE 'unknown'
  END;
$$;

-- 4) Per-session view exposing every mission-required field
CREATE OR REPLACE VIEW public.canonical_sessions_traffic_class
WITH (security_invoker = true) AS
SELECT
  cs.session_id,
  cs.visitor_id,
  cs.first_seen_at,
  cs.last_seen_at,
  cs.country,
  cs.device,
  cs.classified_channel                            AS traffic_channel,
  public.classify_traffic_class(cs.classified_channel) AS traffic_class,
  cs.utm_source                                     AS traffic_source,
  cs.utm_medium                                     AS traffic_medium,
  public.traffic_platform_of(cs.classified_channel) AS traffic_platform,
  (public.classify_traffic_class(cs.classified_channel) = 'paid')     AS paid_flag,
  (public.classify_traffic_class(cs.classified_channel) = 'organic')  AS organic_flag,
  (public.classify_traffic_class(cs.classified_channel) = 'bot')      AS bot_flag,
  (public.classify_traffic_class(cs.classified_channel) = 'internal') AS internal_flag,
  CASE
    WHEN cs.first_gclid IS NOT NULL OR cs.first_msclkid IS NOT NULL
      OR cs.first_ttclid IS NOT NULL OR cs.first_fbclid IS NOT NULL
      OR cs.first_pinterest_click_id IS NOT NULL THEN 'click_id'
    WHEN cs.utm_source IS NOT NULL AND cs.utm_source <> '' THEN 'utm'
    WHEN cs.referrer IS NOT NULL AND cs.referrer <> '' THEN 'referrer'
    WHEN coalesce(cs.referrer,'')='' AND coalesce(cs.utm_source,'')='' THEN 'no_signal_direct'
    ELSE 'fallback'
  END AS classification_reason,
  CASE
    WHEN cs.first_gclid IS NOT NULL OR cs.first_msclkid IS NOT NULL
      OR cs.first_ttclid IS NOT NULL OR cs.first_pinterest_click_id IS NOT NULL THEN 0.99
    WHEN cs.utm_source IS NOT NULL AND cs.utm_medium IS NOT NULL THEN 0.90
    WHEN cs.utm_source IS NOT NULL THEN 0.75
    WHEN cs.referrer IS NOT NULL AND cs.referrer <> '' THEN 0.70
    WHEN coalesce(cs.referrer,'')='' AND coalesce(cs.utm_source,'')='' THEN 0.60
    ELSE 0.40
  END AS attribution_confidence
FROM public.canonical_sessions cs;

GRANT SELECT ON public.canonical_sessions_traffic_class TO authenticated, anon, service_role;

-- 5) 7-day summary
CREATE OR REPLACE VIEW public.canonical_sessions_traffic_class_summary_7d
WITH (security_invoker = true) AS
SELECT
  traffic_class,
  count(*)                    AS sessions,
  count(DISTINCT visitor_id)  AS visitors
FROM public.canonical_sessions_traffic_class
WHERE last_seen_at > now() - interval '7 days'
GROUP BY 1
ORDER BY sessions DESC;

GRANT SELECT ON public.canonical_sessions_traffic_class_summary_7d TO authenticated, anon, service_role;

-- 6) Backfill classified_channel where the improved classifier now yields a better answer.
-- Read-only for publishers/queues; only touches canonical_sessions.classified_channel.
UPDATE public.canonical_sessions cs
SET classified_channel = public.classify_traffic_source(
      cs.referrer, cs.utm_source, cs.utm_medium,
      jsonb_strip_nulls(jsonb_build_object(
        'gclid', cs.first_gclid, 'fbclid', cs.first_fbclid,
        'ttclid', cs.first_ttclid, 'msclkid', cs.first_msclkid,
        'pinterest_click_id', cs.first_pinterest_click_id
      ))
    )
WHERE cs.last_seen_at > now() - interval '30 days'
  AND cs.classified_channel IS DISTINCT FROM public.classify_traffic_source(
      cs.referrer, cs.utm_source, cs.utm_medium,
      jsonb_strip_nulls(jsonb_build_object(
        'gclid', cs.first_gclid, 'fbclid', cs.first_fbclid,
        'ttclid', cs.first_ttclid, 'msclkid', cs.first_msclkid,
        'pinterest_click_id', cs.first_pinterest_click_id
      ))
    );
