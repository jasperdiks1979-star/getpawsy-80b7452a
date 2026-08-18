CREATE OR REPLACE FUNCTION public.gp_unified_analytics_v2(p_hours integer DEFAULT 720)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := now() - make_interval(hours => greatest(1, least(p_hours, 8760)));
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT
      s.session_id, s.visitor_id, s.first_seen_at, s.last_seen_at,
      s.classified_channel, s.traffic_class, s.is_bot, s.is_internal,
      s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content,
      s.country, s.device, s.order_id, s.landing_page, s.referrer,
      split_part(coalesce(s.landing_page, ''), '?', 1) AS landing_path,
      lower(coalesce(s.referrer, '')) AS ref_l,
      lower(coalesce(s.utm_campaign, '')) AS camp_l,
      lower(coalesce(s.session_id, '')) AS sid_l,
      lower(coalesce(s.landing_page, '')) AS lp_l
    FROM public.canonical_sessions s
    WHERE s.first_seen_at >= v_from
      AND coalesce(s.exclude_from_commercial, false) = false
  ),
  raw_all AS MATERIALIZED (
    SELECT count(*) AS raw_sessions_with_prefilter
    FROM public.canonical_sessions s WHERE s.first_seen_at >= v_from
  ),
  ev AS MATERIALIZED (
    SELECT e.session_id, e.canonical_name::text AS nm, e.occurred_at, e.product_id
    FROM public.canonical_events e
    JOIN base b ON b.session_id = e.session_id
    WHERE e.occurred_at >= v_from AND coalesce(e.technical_path, false) = false
  ),
  ev_sess AS (
    SELECT session_id,
      count(*) FILTER (WHERE nm = 'CANONICAL_PAGE_VIEW')    AS page_views,
      count(*) FILTER (WHERE nm = 'CANONICAL_PRODUCT_VIEW') AS product_views,
      count(*) FILTER (WHERE nm = 'CANONICAL_ADD_TO_CART')  AS atc,
      count(*) FILTER (WHERE nm = 'CANONICAL_CHECKOUT')     AS checkouts
    FROM ev GROUP BY session_id
  ),
  dup AS (
    SELECT session_id,
      row_number() OVER (PARTITION BY visitor_id, landing_path ORDER BY first_seen_at) AS rn,
      first_seen_at - lag(first_seen_at) OVER (PARTITION BY visitor_id, landing_path ORDER BY first_seen_at) AS gap
    FROM base
  ),
  cls AS MATERIALIZED (
    SELECT b.*,
      coalesce(e.page_views, 0) AS page_views,
      coalesce(e.product_views, 0) AS product_views,
      coalesce(e.atc, 0) AS atc,
      coalesce(e.checkouts, 0) AS checkouts,
      CASE
        WHEN b.is_bot
          OR upper(coalesce(b.traffic_class, '')) LIKE '%BOT%'
          OR upper(coalesce(b.traffic_class, '')) LIKE '%CRAWL%'
          THEN 'BOT_CRAWLER'
        WHEN b.landing_path ~ '^/(healthz|api/|\.well-known)' THEN 'MONITORING_HEALTHCHECK'
        WHEN b.sid_l LIKE 'atc-%' OR b.sid_l LIKE 'smoke-%' OR b.sid_l LIKE 'synthetic-%' OR b.sid_l LIKE 'e2e-%'
          OR b.lp_l LIKE '%_smoke=%' OR b.lp_l LIKE '%smoke_test=%' OR b.lp_l LIKE '%__lovable%'
          OR b.ref_l LIKE '%lovable.dev%' OR b.ref_l LIKE '%lovable.app%' OR b.ref_l LIKE '%lovableproject.com%'
          OR b.ref_l LIKE '%id-preview--%'
          OR b.camp_l IN ('overnight_qa', 'smoke_test', 'qa', 'e2e', 'synthetic')
          THEN 'INTERNAL_QA'
        WHEN b.is_internal
          OR upper(coalesce(b.traffic_class, '')) LIKE 'INTERNAL%'
          OR b.landing_path ~ '^/(admin|dashboard|auth)(/|$)'
          OR b.ref_l ~ 'getpawsy\.pet/(admin|dashboard|auth)'
          THEN 'INTERNAL_ADMIN'
        WHEN b.camp_l IN ('automation', 'bot_test') THEN 'AUTOMATION'
        WHEN d.rn > 1 AND d.gap < interval '30 minutes' THEN 'DUPLICATE_SESSION'
        WHEN coalesce(e.product_views, 0) > 0 OR coalesce(e.atc, 0) > 0 THEN 'REAL_SHOPPER'
        WHEN coalesce(b.device, '') <> '' THEN 'LIKELY_HUMAN'
        ELSE 'UNKNOWN'
      END AS session_class,
      CASE
        WHEN coalesce(b.utm_campaign, '') = '' THEN NULL
        WHEN lower(b.utm_campaign) IN ('overnight_qa','smoke_test','qa','e2e','synthetic') THEN 'QA'
        WHEN lower(b.utm_campaign) IN ('automation','bot_test') THEN 'AUTOMATION'
        WHEN lower(b.utm_campaign) IN ('gp25_high_potential','getpawsy_best_product_push','getpawsy_next_2_products_push','pinterest_auto','creative_director','creative_factory') THEN 'PRODUCTION_MARKETING'
        WHEN lower(b.utm_campaign) IN ('hook5') THEN 'HISTORICAL_MARKETING'
        ELSE 'UNKNOWN'
      END AS campaign_class,
      CASE
        WHEN b.ref_l = '' THEN NULL
        ELSE regexp_replace(regexp_replace(b.ref_l, '^[a-z]+://', ''), '/.*$', '')
      END AS referrer_host
    FROM base b
    LEFT JOIN ev_sess e ON e.session_id = b.session_id
    LEFT JOIN dup d ON d.session_id = b.session_id
  ),
  q AS MATERIALIZED (
    SELECT * FROM cls WHERE session_class IN ('REAL_SHOPPER', 'LIKELY_HUMAN')
  ),
  ord AS MATERIALIZED (
    SELECT o.id, o.created_at, o.total_amount, o.currency, o.status
    FROM public.orders o
    WHERE o.created_at >= v_from AND o.status = 'paid'
  ),
  series AS (SELECT g::date AS day FROM generate_series(v_from::date, now()::date, interval '1 day') g)
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_hours', p_hours,
    'from', v_from,
    'kpis', jsonb_build_object(
      'qualified_sessions', (SELECT count(*) FROM q),
      'raw_sessions', (SELECT count(*) FROM cls),
      'raw_sessions_all_ingested', (SELECT raw_sessions_with_prefilter FROM raw_all),
      'excluded_sessions', (SELECT count(*) FROM cls WHERE session_class NOT IN ('REAL_SHOPPER','LIKELY_HUMAN')),
      'pinterest_sessions', (SELECT count(*) FROM q WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'),
      'product_views', (SELECT coalesce(sum(product_views),0) FROM q),
      'add_to_cart', (SELECT coalesce(sum(atc),0) FROM q),
      'checkouts', (SELECT coalesce(sum(checkouts),0) FROM q),
      'orders', (SELECT count(*) FROM ord),
      'revenue', (SELECT coalesce(sum(total_amount),0) FROM ord)
    ),
    'kpis_raw', jsonb_build_object(
      'sessions', (SELECT count(*) FROM cls),
      'product_views', (SELECT coalesce(sum(product_views),0) FROM cls),
      'add_to_cart', (SELECT coalesce(sum(atc),0) FROM cls),
      'checkouts', (SELECT coalesce(sum(checkouts),0) FROM cls),
      'orders', (SELECT count(*) FROM ord)
    ),
    'exclusions', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT session_class AS reason, count(*) AS sessions,
               coalesce(sum(product_views),0) AS product_views,
               coalesce(sum(atc),0) AS add_to_cart
        FROM cls WHERE session_class NOT IN ('REAL_SHOPPER','LIKELY_HUMAN')
        GROUP BY 1 ORDER BY 2 DESC
      ) x
    ), '[]'::jsonb),
    'class_breakdown', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT session_class, count(*) AS sessions FROM cls GROUP BY 1
      ) x
    ), '[]'::jsonb),
    'timeseries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', s.day,
        'qualified_sessions', coalesce(qs.n, 0),
        'raw_sessions', coalesce(rs.n, 0),
        'product_views', coalesce(qs.pv, 0),
        'add_to_cart', coalesce(qs.atc, 0),
        'orders', coalesce(od.n, 0),
        'revenue', coalesce(od.rev, 0)
      ) ORDER BY s.day)
      FROM series s
      LEFT JOIN (SELECT first_seen_at::date d, count(*) n, sum(product_views) pv, sum(atc) atc FROM q GROUP BY 1) qs ON qs.d = s.day
      LEFT JOIN (SELECT first_seen_at::date d, count(*) n FROM cls GROUP BY 1) rs ON rs.d = s.day
      LEFT JOIN (SELECT created_at::date d, count(*) n, sum(total_amount) rev FROM ord GROUP BY 1) od ON od.d = s.day
    ), '[]'::jsonb),
    'channels', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qualified_sessions DESC) FROM (
        SELECT coalesce(nullif(classified_channel,''),'unknown') AS channel,
               count(*) AS qualified_sessions,
               coalesce(sum(product_views),0) AS product_views,
               coalesce(sum(atc),0) AS add_to_cart,
               coalesce(sum(checkouts),0) AS checkouts,
               count(*) FILTER (WHERE order_id IS NOT NULL) AS orders
        FROM q GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'referral_hosts', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(referrer_host,'(none)') AS host,
               count(*) AS sessions,
               count(*) FILTER (WHERE session_class IN ('REAL_SHOPPER','LIKELY_HUMAN')) AS qualified,
               coalesce(sum(product_views),0) AS product_views,
               coalesce(sum(atc),0) AS add_to_cart
        FROM cls WHERE coalesce(classified_channel,'') = 'referral'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'campaigns', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT utm_campaign AS campaign, campaign_class,
               coalesce(nullif(utm_source,''),'(none)') AS source,
               count(*) AS sessions,
               count(*) FILTER (WHERE session_class IN ('REAL_SHOPPER','LIKELY_HUMAN')) AS qualified,
               coalesce(sum(product_views),0) AS product_views,
               coalesce(sum(atc),0) AS add_to_cart
        FROM cls WHERE coalesce(utm_campaign,'') <> ''
        GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 30
      ) x
    ), '[]'::jsonb),
    'pinterest', jsonb_build_object(
      'totals', (SELECT jsonb_build_object(
          'qualified_sessions', count(*),
          'product_views', coalesce(sum(product_views),0),
          'add_to_cart', coalesce(sum(atc),0),
          'checkouts', coalesce(sum(checkouts),0),
          'orders', count(*) FILTER (WHERE order_id IS NOT NULL)
        ) FROM q WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'),
      'by_campaign', coalesce((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
          SELECT coalesce(nullif(utm_campaign,''),'(none)') AS campaign, count(*) AS sessions,
                 coalesce(sum(product_views),0) AS product_views, coalesce(sum(atc),0) AS add_to_cart
          FROM q WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 25
        ) x), '[]'::jsonb),
      'by_pin', coalesce((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
          SELECT coalesce(nullif(utm_content,''),'(none)') AS pin,
                 coalesce(nullif(utm_campaign,''),'(none)') AS campaign,
                 count(*) AS sessions, coalesce(sum(product_views),0) AS product_views,
                 coalesce(sum(atc),0) AS add_to_cart
          FROM q WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'
          GROUP BY 1,2 ORDER BY 3 DESC LIMIT 40
        ) x), '[]'::jsonb),
      'by_landing', coalesce((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
          SELECT landing_path AS page, count(*) AS sessions, coalesce(sum(atc),0) AS add_to_cart
          FROM q WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 25
        ) x), '[]'::jsonb)
    ),
    'new_campaigns', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.campaign) FROM (
        SELECT c.campaign,
               (SELECT count(*) FROM q WHERE lower(coalesce(q.utm_campaign,'')) = c.campaign) AS qualified_sessions,
               (SELECT coalesce(sum(q.product_views),0) FROM q WHERE lower(coalesce(q.utm_campaign,'')) = c.campaign) AS product_views,
               (SELECT coalesce(sum(q.atc),0) FROM q WHERE lower(coalesce(q.utm_campaign,'')) = c.campaign) AS add_to_cart
        FROM (VALUES ('gp25_high_potential'),('getpawsy_best_product_push'),('getpawsy_next_2_products_push')) AS c(campaign)
      ) x
    ), '[]'::jsonb),
    'landing_pages', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT landing_path AS page, count(*) AS sessions,
               coalesce(sum(product_views),0) AS product_views, coalesce(sum(atc),0) AS add_to_cart
        FROM q WHERE landing_path !~ '^/(admin|dashboard|auth)(/|$)'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'countries', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(nullif(country,''),'unknown') AS country, count(*) AS sessions
        FROM q GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      ) x
    ), '[]'::jsonb),
    'geo_unknown_pct', (SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE coalesce(country,'') = '') / count(*), 1) END FROM q),
    'products', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.add_to_cart DESC, x.views DESC) FROM (
        SELECT e.product_id,
               coalesce(p.name, e.product_id) AS name, p.slug, p.price, p.stock, p.is_active,
               count(*) FILTER (WHERE e.nm = 'CANONICAL_PRODUCT_VIEW') AS views,
               count(*) FILTER (WHERE e.nm = 'CANONICAL_ADD_TO_CART') AS add_to_cart,
               (coalesce(p.stock, 0) <= 0) AS out_of_stock
        FROM ev e
        JOIN q ON q.session_id = e.session_id
        LEFT JOIN public.products p ON p.id::text = e.product_id
        WHERE e.product_id IS NOT NULL
        GROUP BY e.product_id, p.name, p.slug, p.price, p.stock, p.is_active
        ORDER BY 8 DESC, 7 DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC) FROM (
        SELECT e.occurred_at,
               coalesce(nullif(q.classified_channel,''),'direct') AS channel,
               coalesce(q.country,'unknown') AS country,
               coalesce(q.device,'unknown') AS device,
               CASE e.nm WHEN 'CANONICAL_PRODUCT_VIEW' THEN 'viewed'
                         WHEN 'CANONICAL_ADD_TO_CART' THEN 'added to cart'
                         WHEN 'CANONICAL_CHECKOUT' THEN 'started checkout'
                         WHEN 'CANONICAL_CART' THEN 'opened cart'
                         ELSE 'browsed' END AS action,
               coalesce(p.name, '(site)') AS product
        FROM ev e
        JOIN q ON q.session_id = e.session_id
        LEFT JOIN public.products p ON p.id::text = e.product_id
        WHERE e.nm <> 'CANONICAL_PAGE_VIEW'
        ORDER BY e.occurred_at DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT id, created_at, total_amount, currency, status FROM ord ORDER BY created_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gp_unified_analytics_v2(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gp_unified_analytics_v2(integer) TO authenticated;