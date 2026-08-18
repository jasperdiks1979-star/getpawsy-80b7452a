-- Index for the bounded live-presence window (avoids any full scan).
CREATE INDEX IF NOT EXISTS idx_visitor_activity_live_presence
  ON public.visitor_activity (last_seen_at DESC, session_id);

CREATE OR REPLACE FUNCTION public.gp_live_visitors(p_minutes integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_min integer := greatest(1, least(coalesce(p_minutes, 5), 60));
  v_from timestamptz := now() - make_interval(mins => v_min);
  v_moment_from timestamptz := now() - make_interval(mins => greatest(v_min, 15));
  v_last timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT max(last_seen_at) INTO v_last FROM public.visitor_activity
   WHERE last_seen_at >= now() - interval '2 hours';

  WITH win AS MATERIALIZED (
    SELECT
      va.session_id, va.activity_type, va.country, va.page_path, va.product_id,
      va.product_name, va.device_type, va.utm_source, va.utm_medium,
      va.utm_campaign, va.utm_content, va.referrer, va.referrer_category,
      va.last_seen_at, va.created_at, va.is_internal, va.is_admin_path,
      va.is_bot_suspect, va.traffic_quality,
      split_part(coalesce(va.page_path, ''), '?', 1) AS path,
      lower(coalesce(va.page_path, '')) AS path_l,
      lower(coalesce(va.referrer, '')) AS ref_l,
      lower(coalesce(va.utm_campaign, '')) AS camp_l,
      lower(coalesce(va.session_id, '')) AS sid_l
    FROM public.visitor_activity va
    WHERE va.last_seen_at >= v_from
  ),
  agg AS (
    SELECT session_id,
      max(last_seen_at) AS last_seen_at,
      min(created_at)   AS started_at,
      bool_or(activity_type IN ('product_view', 'add_to_cart')) AS engaged,
      bool_or(activity_type = 'add_to_cart') AS has_atc,
      bool_or(activity_type = 'checkout')    AS has_checkout,
      bool_or(is_internal)    AS any_internal,
      bool_or(is_admin_path)  AS any_admin_path,
      bool_or(is_bot_suspect) AS any_bot,
      bool_or(traffic_quality IN ('bot', 'crawler')) AS any_bot_quality,
      bool_or(path ~ '^/(healthz|api/|\.well-known)') AS any_health,
      bool_or(path ~ '^/(admin|dashboard|auth)(/|$)') AS any_admin_route,
      bool_or(
        sid_l LIKE 'atc-%' OR sid_l LIKE 'smoke-%' OR sid_l LIKE 'synthetic-%' OR sid_l LIKE 'e2e-%'
        OR path_l LIKE '%_smoke=%' OR path_l LIKE '%smoke_test=%' OR path_l LIKE '%__lovable%'
        OR ref_l LIKE '%lovable.dev%' OR ref_l LIKE '%lovable.app%'
        OR ref_l LIKE '%lovableproject.com%' OR ref_l LIKE '%id-preview--%'
        OR camp_l IN ('overnight_qa', 'smoke_test', 'qa', 'e2e', 'synthetic')
      ) AS any_qa,
      bool_or(camp_l IN ('automation', 'bot_test')) AS any_automation
    FROM win GROUP BY session_id
  ),
  latest AS (
    SELECT DISTINCT ON (session_id) *
    FROM win ORDER BY session_id, last_seen_at DESC, created_at DESC
  ),
  cls AS MATERIALIZED (
    SELECT
      a.session_id, a.last_seen_at, a.started_at, a.has_atc, a.has_checkout,
      l.country, l.path, l.product_id, l.product_name, l.device_type,
      l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content,
      l.referrer_category, l.ref_l,
      CASE
        WHEN a.any_bot OR a.any_bot_quality THEN 'BOT_CRAWLER'
        WHEN a.any_health THEN 'MONITORING_HEALTHCHECK'
        WHEN a.any_qa THEN 'INTERNAL_QA'
        WHEN a.any_internal OR a.any_admin_path OR a.any_admin_route THEN 'INTERNAL_ADMIN'
        WHEN a.any_automation THEN 'AUTOMATION'
        WHEN a.engaged THEN 'REAL_SHOPPER'
        WHEN coalesce(l.device_type, '') <> '' THEN 'LIKELY_HUMAN'
        ELSE 'UNKNOWN'
      END AS session_class,
      CASE
        WHEN lower(coalesce(l.utm_source, '')) LIKE '%pinterest%' OR l.ref_l LIKE '%pinterest.%' THEN 'Pinterest Organic'
        WHEN lower(coalesce(l.utm_source, '')) LIKE '%tiktok%'    OR l.ref_l LIKE '%tiktok.%'    THEN 'TikTok'
        WHEN lower(coalesce(l.utm_source, '')) LIKE '%google%'    OR l.ref_l LIKE '%google.%'    THEN 'Google Organic'
        WHEN lower(coalesce(l.utm_source, '')) LIKE '%bing%'      OR l.ref_l LIKE '%bing.%'      THEN 'Bing Organic'
        WHEN lower(coalesce(l.utm_source, '')) LIKE '%facebook%'  OR l.ref_l LIKE '%facebook.%'  THEN 'Facebook'
        WHEN lower(coalesce(l.utm_source, '')) LIKE '%instagram%' OR l.ref_l LIKE '%instagram.%' THEN 'Instagram'
        WHEN coalesce(l.utm_medium, '') IN ('cpc', 'ppc', 'paid') THEN 'Paid'
        WHEN coalesce(l.referrer_category, '') = 'direct' OR coalesce(l.ref_l, '') = '' THEN 'Direct'
        ELSE 'Referral'
      END AS channel,
      CASE
        WHEN l.path LIKE '/products/%' THEN 'Product'
        WHEN l.path LIKE '/collections/%' OR l.path LIKE '/shop%' THEN 'Collection'
        WHEN l.path = '/cart' THEN 'Cart'
        WHEN l.path LIKE '/checkout%' THEN 'Checkout'
        WHEN l.path LIKE '/blog%' OR l.path LIKE '/guides%' THEN 'Content'
        WHEN l.path = '/' OR coalesce(l.path, '') = '' THEN 'Homepage'
        ELSE 'Other'
      END AS page_type
    FROM agg a JOIN latest l ON l.session_id = a.session_id
  ),
  q AS (
    SELECT * FROM cls WHERE session_class IN ('REAL_SHOPPER', 'LIKELY_HUMAN')
  ),
  moments AS (
    SELECT w.activity_type, w.country, w.product_name, w.last_seen_at,
           c.channel
    FROM public.visitor_activity w
    JOIN q c ON c.session_id = w.session_id
    WHERE w.last_seen_at >= v_moment_from
      AND w.activity_type IN ('product_view', 'add_to_cart', 'checkout')
    ORDER BY w.last_seen_at DESC
    LIMIT 8
  )
  SELECT jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'window_minutes', v_min,
    'last_activity_at', v_last,
    'active_total', (SELECT count(*) FROM q),
    'known_location', (SELECT count(*) FROM q WHERE coalesce(country, '') <> ''),
    'unknown_location', (SELECT count(*) FROM q WHERE coalesce(country, '') = ''),
    'excluded_total', (SELECT count(*) FROM cls WHERE session_class NOT IN ('REAL_SHOPPER','LIKELY_HUMAN')),
    'excluded_by_class', coalesce((
      SELECT jsonb_agg(jsonb_build_object('label', session_class, 'count', n) ORDER BY n DESC)
      FROM (SELECT session_class, count(*) n FROM cls
             WHERE session_class NOT IN ('REAL_SHOPPER','LIKELY_HUMAN')
             GROUP BY 1) x), '[]'::jsonb),
    'countries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'country', country, 'visitors', n,
        'channels', ch, 'pages', pg) ORDER BY n DESC)
      FROM (
        SELECT country, count(*) n,
          (SELECT jsonb_agg(jsonb_build_object('label', ch2, 'count', c2) ORDER BY c2 DESC)
             FROM (SELECT channel ch2, count(*) c2 FROM q q2
                    WHERE q2.country IS NOT DISTINCT FROM q1.country GROUP BY 1) s1) ch,
          (SELECT jsonb_agg(jsonb_build_object('label', pl, 'count', c3) ORDER BY c3 DESC)
             FROM (SELECT coalesce(product_name, page_type) pl, count(*) c3 FROM q q3
                    WHERE q3.country IS NOT DISTINCT FROM q1.country GROUP BY 1) s2) pg
        FROM q q1 WHERE coalesce(country, '') <> '' GROUP BY country
      ) y), '[]'::jsonb),
    'channels', coalesce((
      SELECT jsonb_agg(jsonb_build_object('label', channel, 'count', n) ORDER BY n DESC)
      FROM (SELECT channel, count(*) n FROM q GROUP BY 1) c), '[]'::jsonb),
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object('label', product_name, 'count', n) ORDER BY n DESC)
      FROM (SELECT product_name, count(*) n FROM q
             WHERE coalesce(product_name, '') <> '' GROUP BY 1 LIMIT 5) p), '[]'::jsonb),
    'pinterest', jsonb_build_object(
      'visitors', (SELECT count(*) FROM q WHERE channel = 'Pinterest Organic'),
      'targets', coalesce((
        SELECT jsonb_agg(jsonb_build_object('label', lbl, 'count', n) ORDER BY n DESC)
        FROM (SELECT coalesce(nullif(product_name, ''), nullif(utm_content, ''), page_type) lbl, count(*) n
                FROM q WHERE channel = 'Pinterest Organic' GROUP BY 1 LIMIT 5) t), '[]'::jsonb)),
    'visitors', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'country', country, 'channel', channel, 'page_type', page_type,
        'product_name', product_name, 'device', device_type,
        'seconds_idle', greatest(0, floor(extract(epoch FROM (now() - last_seen_at)))::int),
        'has_atc', has_atc, 'has_checkout', has_checkout,
        'session_class', session_class) ORDER BY last_seen_at DESC)
      FROM (SELECT * FROM q ORDER BY last_seen_at DESC LIMIT 25) v), '[]'::jsonb),
    'moments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', activity_type, 'country', country, 'channel', channel,
        'product_name', product_name,
        'seconds_ago', greatest(0, floor(extract(epoch FROM (now() - last_seen_at)))::int))
        ORDER BY last_seen_at DESC)
      FROM moments), '[]'::jsonb),
    'health', jsonb_build_object(
      'status', CASE
        WHEN v_last IS NULL THEN 'UNAVAILABLE'
        WHEN v_last < now() - interval '30 minutes' THEN 'DEGRADED'
        ELSE 'HEALTHY' END,
      'reason', CASE
        WHEN v_last IS NULL THEN 'No visitor activity ingested in the last 2 hours'
        WHEN v_last < now() - interval '30 minutes' THEN 'Last presence signal is older than 30 minutes'
        ELSE NULL END,
      'last_activity_at', v_last)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.gp_live_visitors(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gp_live_visitors(integer) TO authenticated, service_role;