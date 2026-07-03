-- ============================================================================
-- Attribution cleanup hotfix
-- ============================================================================
-- 1. Tighten classify_traffic_source():
--      * self-stamped utm_source='direct' / utm_medium='(none)' is treated as
--        NO utm (the pollution fingerprint), never as real 'direct'
--      * Lovable editor/preview referrers → 'internal_preview'
--      * genuinely missing referrer + utm → 'unknown' (only bare-empty
--        with an explicit "type-in" heuristic ever returns 'direct')
-- 2. Backfill last 7 days per the new rules.

CREATE OR REPLACE FUNCTION public.classify_traffic_source(
  p_referrer text,
  p_utm_source text,
  p_utm_medium text,
  p_click_ids jsonb DEFAULT '{}'::jsonb
) RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
AS $function$
DECLARE
  ref text := lower(coalesce(p_referrer,''));
  raw_src text := lower(coalesce(p_utm_source,''));
  raw_med text := lower(coalesce(p_utm_medium,''));
  -- Strip the self-stamped fallback fingerprint. Anything with
  -- utm_source='direct' AND utm_medium='(none)'|'none'|'' is treated as
  -- if no utm had been sent — it was the client-side fallback writer
  -- polluting internal links, never a genuine acquisition signal.
  src text := CASE
    WHEN raw_src = 'direct' AND raw_med IN ('(none)', 'none', '') THEN ''
    ELSE raw_src
  END;
  med text := CASE
    WHEN raw_src = 'direct' AND raw_med IN ('(none)', 'none', '') THEN ''
    ELSE raw_med
  END;
  ids jsonb := coalesce(p_click_ids,'{}'::jsonb);
  paid boolean := (med IN ('cpc','ppc','paid','paidsocial','paid_social','display','banner','cpm'))
                  OR (ids ? 'gclid') OR (ids ? 'fbclid') OR (ids ? 'msclkid');
BEGIN
  -- Click-id fast path
  IF ids ? 'ttclid' THEN RETURN 'tiktok_ads'; END IF;
  IF ids ? 'gclid' THEN RETURN 'google_ads'; END IF;
  IF ids ? 'msclkid' THEN RETURN 'bing_ads'; END IF;
  IF ids ? 'fbclid' AND (src LIKE '%instagram%' OR ref LIKE '%instagram%') THEN RETURN 'instagram_ads'; END IF;
  IF ids ? 'fbclid' THEN RETURN 'facebook_ads'; END IF;
  IF (ids ? 'pinterest_click_id') OR (src = 'pinterest' AND paid) THEN RETURN 'pinterest_ads'; END IF;

  -- Lovable editor / preview referrers — always internal_preview, before
  -- UTM-based classification, because they must never inflate real
  -- acquisition channels even if a stray utm slipped through.
  IF ref LIKE '%lovable.dev%' OR ref LIKE '%lovable.app%'
     OR ref LIKE '%lovableproject.com%' OR ref LIKE '%gptengineer.app%' THEN
    RETURN 'internal_preview';
  END IF;

  -- UTM-first classification
  IF src IN ('pinterest','pin','pinterest.com') THEN
    RETURN CASE WHEN paid THEN 'pinterest_ads' ELSE 'pinterest_organic' END;
  END IF;
  IF src IN ('google','google.com') THEN
    RETURN CASE WHEN paid THEN 'google_ads' ELSE 'google_organic' END;
  END IF;
  IF src IN ('tiktok','tiktok.com') THEN
    RETURN CASE WHEN paid THEN 'tiktok_ads' ELSE 'tiktok_organic' END;
  END IF;
  IF src IN ('facebook','fb','facebook.com') THEN
    RETURN CASE WHEN paid THEN 'facebook_ads' ELSE 'facebook_organic' END;
  END IF;
  IF src IN ('instagram','ig','instagram.com') THEN
    RETURN CASE WHEN paid THEN 'instagram_ads' ELSE 'instagram_organic' END;
  END IF;
  IF src IN ('reddit','reddit.com') THEN RETURN 'reddit'; END IF;
  IF src IN ('youtube','youtube.com','yt') THEN RETURN 'youtube'; END IF;
  IF med IN ('email','newsletter') OR src LIKE '%klaviyo%' OR src LIKE '%mailchimp%' THEN RETURN 'email'; END IF;
  IF med IN ('affiliate') OR src LIKE '%affiliate%' THEN RETURN 'affiliate'; END IF;

  -- Referrer-based fallback
  IF med = 'referral' OR (ref <> '' AND src = '') THEN
    IF ref LIKE '%pinterest.%' OR ref LIKE '%pin.it%' THEN RETURN 'pinterest_organic'; END IF;
    IF ref LIKE '%google.%' THEN RETURN 'google_organic'; END IF;
    IF ref LIKE '%tiktok.%' THEN RETURN 'tiktok_organic'; END IF;
    IF ref LIKE '%facebook.%' OR ref LIKE '%fb.%' OR ref LIKE '%l.facebook%' THEN RETURN 'facebook_organic'; END IF;
    IF ref LIKE '%instagram.%' OR ref LIKE '%l.instagram%' THEN RETURN 'instagram_organic'; END IF;
    IF ref LIKE '%reddit.%' THEN RETURN 'reddit'; END IF;
    IF ref LIKE '%youtube.%' OR ref LIKE '%youtu.be%' THEN RETURN 'youtube'; END IF;
    IF ref LIKE '%bing.%' THEN RETURN 'bing_organic'; END IF;
    IF ref LIKE '%duckduckgo.%' THEN RETURN 'duckduckgo_organic'; END IF;
    IF ref LIKE '%getpawsy.%' THEN RETURN 'internal'; END IF;
    IF ref LIKE '%bot%' OR ref LIKE '%crawler%' OR ref LIKE '%spider%' THEN RETURN 'bot'; END IF;
    RETURN 'referral';
  END IF;

  -- No referrer, no utm, no click ids — genuinely unattributed.
  -- We deliberately return `unknown` instead of `direct` because in a
  -- real browser a true direct visit is rare; the far more likely cause
  -- is a stripped Referer header (in-app browser, no-referrer policy,
  -- prefetch) which is NOT the same as "the user typed the URL".
  RETURN 'unknown';
END;
$function$;

-- ---------------------------------------------------------------------------
-- Backfill the last 7 days with the new rules
-- ---------------------------------------------------------------------------
UPDATE public.canonical_sessions
SET classified_channel = public.classify_traffic_source(
  referrer,
  utm_source,
  utm_medium,
  jsonb_strip_nulls(jsonb_build_object(
    'gclid',              first_gclid,
    'fbclid',             first_fbclid,
    'ttclid',             first_ttclid,
    'msclkid',            first_msclkid,
    'pinterest_click_id', first_pinterest_click_id
  ))
),
attribution_snapshot_at = now()
WHERE first_seen_at >= now() - interval '7 days'
  AND attribution_locked IS NOT TRUE;
