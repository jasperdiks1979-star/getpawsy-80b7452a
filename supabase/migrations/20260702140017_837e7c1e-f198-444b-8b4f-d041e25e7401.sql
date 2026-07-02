
-- =========================================================================
-- GENESIS Ω∞ Revenue Attribution — schema extensions
-- All additive. Extends canonical_sessions, analytics_session_quality.
-- Adds classify_traffic_source() and 3 attribution views.
-- =========================================================================

-- 1. canonical_sessions: immutable first-touch attribution snapshot
ALTER TABLE public.canonical_sessions
  ADD COLUMN IF NOT EXISTS first_utm_source text,
  ADD COLUMN IF NOT EXISTS first_utm_medium text,
  ADD COLUMN IF NOT EXISTS first_utm_campaign text,
  ADD COLUMN IF NOT EXISTS first_utm_content text,
  ADD COLUMN IF NOT EXISTS first_utm_term text,
  ADD COLUMN IF NOT EXISTS first_gclid text,
  ADD COLUMN IF NOT EXISTS first_fbclid text,
  ADD COLUMN IF NOT EXISTS first_ttclid text,
  ADD COLUMN IF NOT EXISTS first_msclkid text,
  ADD COLUMN IF NOT EXISTS first_pinterest_click_id text,
  ADD COLUMN IF NOT EXISTS first_reddit_click_id text,
  ADD COLUMN IF NOT EXISTS first_email_id text,
  ADD COLUMN IF NOT EXISTS first_affiliate_id text,
  ADD COLUMN IF NOT EXISTS first_referrer text,
  ADD COLUMN IF NOT EXISTS first_landing_url text,
  ADD COLUMN IF NOT EXISTS first_landing_path text,
  ADD COLUMN IF NOT EXISTS redirect_chain jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS screen_wxh text,
  ADD COLUMN IF NOT EXISTS classified_channel text,
  ADD COLUMN IF NOT EXISTS attribution_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attribution_snapshot_at timestamptz;

CREATE INDEX IF NOT EXISTS canonical_sessions_channel_idx
  ON public.canonical_sessions (classified_channel);
CREATE INDEX IF NOT EXISTS canonical_sessions_first_seen_idx
  ON public.canonical_sessions (first_seen_at DESC);

-- Immutability trigger: once attribution_locked=true, first_* columns cannot change.
CREATE OR REPLACE FUNCTION public.canonical_sessions_lock_first_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.attribution_locked = true THEN
    NEW.first_utm_source       := OLD.first_utm_source;
    NEW.first_utm_medium       := OLD.first_utm_medium;
    NEW.first_utm_campaign     := OLD.first_utm_campaign;
    NEW.first_utm_content      := OLD.first_utm_content;
    NEW.first_utm_term         := OLD.first_utm_term;
    NEW.first_gclid            := OLD.first_gclid;
    NEW.first_fbclid           := OLD.first_fbclid;
    NEW.first_ttclid           := OLD.first_ttclid;
    NEW.first_msclkid          := OLD.first_msclkid;
    NEW.first_pinterest_click_id := OLD.first_pinterest_click_id;
    NEW.first_reddit_click_id  := OLD.first_reddit_click_id;
    NEW.first_email_id         := OLD.first_email_id;
    NEW.first_affiliate_id     := OLD.first_affiliate_id;
    NEW.first_referrer         := OLD.first_referrer;
    NEW.first_landing_url      := OLD.first_landing_url;
    NEW.first_landing_path     := OLD.first_landing_path;
    NEW.attribution_snapshot_at := OLD.attribution_snapshot_at;
    NEW.attribution_locked      := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_sessions_lock_first_touch ON public.canonical_sessions;
CREATE TRIGGER trg_canonical_sessions_lock_first_touch
  BEFORE UPDATE ON public.canonical_sessions
  FOR EACH ROW EXECUTE FUNCTION public.canonical_sessions_lock_first_touch();

-- 2. analytics_session_quality: behavioural counters (no PII)
ALTER TABLE public.analytics_session_quality
  ADD COLUMN IF NOT EXISTS dead_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rage_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS back_button_uses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_uses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS menu_uses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filter_uses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variant_selections integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_estimator_uses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkout_exits integer DEFAULT 0;

-- 3. Canonical source classifier
CREATE OR REPLACE FUNCTION public.classify_traffic_source(
  p_referrer text,
  p_utm_source text,
  p_utm_medium text,
  p_click_ids jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ref text := lower(coalesce(p_referrer,''));
  src text := lower(coalesce(p_utm_source,''));
  med text := lower(coalesce(p_utm_medium,''));
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
  IF ids ? 'pinterest_click_id' OR src = 'pinterest' AND paid THEN RETURN 'pinterest_ads'; END IF;

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
  IF med = 'referral' OR (ref <> '' AND src = '') THEN
    -- Referrer-based fallback
    IF ref LIKE '%pinterest.%' OR ref LIKE '%pin.it%' THEN RETURN 'pinterest_organic'; END IF;
    IF ref LIKE '%google.%' THEN RETURN 'google_organic'; END IF;
    IF ref LIKE '%tiktok.%' THEN RETURN 'tiktok_organic'; END IF;
    IF ref LIKE '%facebook.%' OR ref LIKE '%fb.%' OR ref LIKE '%l.facebook%' THEN RETURN 'facebook_organic'; END IF;
    IF ref LIKE '%instagram.%' OR ref LIKE '%l.instagram%' THEN RETURN 'instagram_organic'; END IF;
    IF ref LIKE '%reddit.%' THEN RETURN 'reddit'; END IF;
    IF ref LIKE '%youtube.%' OR ref LIKE '%youtu.be%' THEN RETURN 'youtube'; END IF;
    IF ref LIKE '%bing.%' THEN RETURN 'bing_organic'; END IF;
    IF ref LIKE '%duckduckgo.%' THEN RETURN 'duckduckgo_organic'; END IF;
    IF ref LIKE '%getpawsy.%' OR ref LIKE '%lovable.%' THEN RETURN 'internal'; END IF;
    IF ref LIKE '%bot%' OR ref LIKE '%crawler%' OR ref LIKE '%spider%' THEN RETURN 'bot'; END IF;
    RETURN 'referral';
  END IF;

  -- Truly direct: no referrer AND no utm AND no click ids
  IF ref = '' AND src = '' AND med = '' AND (ids = '{}'::jsonb OR ids IS NULL) THEN
    RETURN 'direct';
  END IF;

  RETURN 'unknown';
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_traffic_source(text,text,text,jsonb) TO authenticated, service_role, anon;

-- 4. Views: product / funnel / landing attribution
CREATE OR REPLACE VIEW public.v_product_attribution_daily
WITH (security_invoker = on) AS
SELECT
  date_trunc('day', ce.occurred_at)::date         AS day,
  ce.product_id,
  coalesce(cs.classified_channel,'unknown')       AS channel,
  count(*) FILTER (WHERE ce.canonical_name='CANONICAL_PRODUCT_VIEW')  AS product_views,
  count(*) FILTER (WHERE ce.canonical_name='CANONICAL_ADD_TO_CART')   AS add_to_carts,
  count(*) FILTER (WHERE ce.canonical_name='CANONICAL_CHECKOUT')      AS checkouts,
  count(*) FILTER (WHERE ce.canonical_name='CANONICAL_PURCHASE')      AS purchases,
  coalesce(sum(ce.value_cents) FILTER (WHERE ce.canonical_name='CANONICAL_PURCHASE'),0) AS revenue_cents,
  count(DISTINCT ce.session_id)                    AS sessions
FROM public.canonical_events ce
LEFT JOIN public.canonical_sessions cs ON cs.session_id = ce.session_id
WHERE ce.product_id IS NOT NULL
  AND ce.occurred_at > now() - interval '90 days'
GROUP BY 1,2,3;

GRANT SELECT ON public.v_product_attribution_daily TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_funnel_intelligence_daily
WITH (security_invoker = on) AS
SELECT
  date_trunc('day', ce.occurred_at)::date        AS day,
  coalesce(cs.classified_channel,'unknown')      AS channel,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_PAGE_VIEW')     AS landing_sessions,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_PRODUCT_VIEW')  AS product_view_sessions,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_ADD_TO_CART')   AS atc_sessions,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_CHECKOUT')      AS checkout_sessions,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_PURCHASE')      AS purchase_sessions,
  coalesce(sum(ce.value_cents) FILTER (WHERE ce.canonical_name='CANONICAL_PURCHASE'),0)    AS revenue_cents
FROM public.canonical_events ce
LEFT JOIN public.canonical_sessions cs ON cs.session_id = ce.session_id
WHERE ce.occurred_at > now() - interval '90 days'
GROUP BY 1,2;

GRANT SELECT ON public.v_funnel_intelligence_daily TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_landing_page_intelligence_daily
WITH (security_invoker = on) AS
SELECT
  date_trunc('day', ce.occurred_at)::date         AS day,
  coalesce(ce.landing_page, ce.page_path, '/')    AS landing_page,
  coalesce(cs.classified_channel,'unknown')       AS channel,
  count(DISTINCT ce.session_id)                    AS sessions,
  count(DISTINCT ce.visitor_id)                    AS unique_visitors,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_PURCHASE') AS purchases,
  coalesce(sum(ce.value_cents) FILTER (WHERE ce.canonical_name='CANONICAL_PURCHASE'),0) AS revenue_cents,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_PRODUCT_VIEW') AS product_view_sessions,
  count(DISTINCT ce.session_id) FILTER (WHERE ce.canonical_name='CANONICAL_ADD_TO_CART') AS atc_sessions
FROM public.canonical_events ce
LEFT JOIN public.canonical_sessions cs ON cs.session_id = ce.session_id
WHERE ce.occurred_at > now() - interval '90 days'
GROUP BY 1,2,3;

GRANT SELECT ON public.v_landing_page_intelligence_daily TO authenticated, service_role;

-- 5. Backfill: classify existing sessions (30d window to keep migration fast)
UPDATE public.canonical_sessions cs
SET classified_channel = public.classify_traffic_source(
      cs.referrer,
      cs.utm_source,
      cs.utm_medium,
      '{}'::jsonb
    )
WHERE cs.classified_channel IS NULL
  AND cs.first_seen_at > now() - interval '30 days';
