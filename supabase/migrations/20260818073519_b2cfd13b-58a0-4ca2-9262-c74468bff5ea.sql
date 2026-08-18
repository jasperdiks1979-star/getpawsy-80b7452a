-- 1. Heartbeat timeout fix
CREATE INDEX IF NOT EXISTS idx_visitor_activity_session_created
  ON public.visitor_activity (session_id, created_at DESC);

-- 2. Crawler visit upsert fix: full (non-partial) unique index so ON CONFLICT (idempotency_key) resolves
CREATE UNIQUE INDEX IF NOT EXISTS crawler_visits_idempotency_key_full_uidx
  ON public.crawler_visits (idempotency_key);

-- 3. Unified analytics RPC (admin only)
CREATE OR REPLACE FUNCTION public.gp_unified_analytics(p_hours integer DEFAULT 720)
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

  WITH sess AS (
    SELECT s.session_id, s.first_seen_at, s.classified_channel, s.traffic_class,
           s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.order_id,
           s.country, s.landing_page
    FROM public.canonical_sessions s
    WHERE s.first_seen_at >= v_from
      AND coalesce(s.exclude_from_commercial, false) = false
  ),
  ev AS (
    SELECT e.session_id, e.canonical_name, e.occurred_at, e.product_id, e.page_path
    FROM public.canonical_events e
    WHERE e.occurred_at >= v_from
      AND coalesce(e.technical_path, false) = false
  ),
  ev_s AS (
    SELECT ev.*, sess.classified_channel, sess.utm_source, sess.utm_campaign, sess.utm_content
    FROM ev JOIN sess USING (session_id)
  ),
  ord AS (
    SELECT o.id, o.created_at, o.total_amount, o.currency, o.status
    FROM public.orders o
    WHERE o.created_at >= v_from AND o.status = 'paid'
  ),
  kpi AS (
    SELECT
      (SELECT count(*) FROM sess) AS sessions,
      (SELECT count(*) FROM ev_s WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS product_views,
      (SELECT count(*) FROM ev_s WHERE canonical_name = 'CANONICAL_ADD_TO_CART') AS add_to_cart,
      (SELECT count(*) FROM ev_s WHERE canonical_name = 'CANONICAL_CHECKOUT') AS checkouts,
      (SELECT count(*) FROM ord) AS orders,
      (SELECT coalesce(sum(total_amount), 0) FROM ord) AS revenue,
      (SELECT count(*) FROM sess WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%') AS pinterest_sessions
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_hours', p_hours,
    'from', v_from,
    'kpis', (SELECT to_jsonb(kpi) FROM kpi),
    'timeseries', coalesce((
      SELECT jsonb_agg(t ORDER BY t.day)
      FROM (
        SELECT d::date AS day,
          (SELECT count(*) FROM sess WHERE sess.first_seen_at::date = d::date) AS sessions,
          (SELECT count(*) FROM ev_s WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW' AND occurred_at::date = d::date) AS product_views,
          (SELECT count(*) FROM ev_s WHERE canonical_name = 'CANONICAL_ADD_TO_CART' AND occurred_at::date = d::date) AS add_to_cart,
          (SELECT count(*) FROM ord WHERE created_at::date = d::date) AS orders,
          (SELECT coalesce(sum(total_amount), 0) FROM ord WHERE created_at::date = d::date) AS revenue
        FROM generate_series(v_from::date, now()::date, interval '1 day') d
      ) t
    ), '[]'::jsonb),
    'sources', coalesce((
      SELECT jsonb_agg(x ORDER BY x.sessions DESC)
      FROM (
        SELECT coalesce(nullif(classified_channel, ''), 'unknown') AS channel,
               count(*) AS sessions,
               count(*) FILTER (WHERE order_id IS NOT NULL) AS orders
        FROM sess GROUP BY 1 LIMIT 25
      ) x
    ), '[]'::jsonb),
    'campaigns', coalesce((
      SELECT jsonb_agg(x ORDER BY x.sessions DESC)
      FROM (
        SELECT coalesce(nullif(utm_campaign, ''), '(none)') AS campaign,
               coalesce(nullif(utm_source, ''), '(none)') AS source,
               count(*) AS sessions,
               count(*) FILTER (WHERE order_id IS NOT NULL) AS orders
        FROM sess
        WHERE utm_campaign IS NOT NULL AND utm_campaign <> ''
        GROUP BY 1, 2 LIMIT 30
      ) x
    ), '[]'::jsonb),
    'pinterest_pins', coalesce((
      SELECT jsonb_agg(x ORDER BY x.sessions DESC)
      FROM (
        SELECT coalesce(nullif(utm_content, ''), '(none)') AS pin,
               coalesce(nullif(utm_campaign, ''), '(none)') AS campaign,
               count(*) AS sessions,
               count(DISTINCT landing_page) AS landing_pages
        FROM sess
        WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'
        GROUP BY 1, 2 LIMIT 50
      ) x
    ), '[]'::jsonb),
    'products', coalesce((
      SELECT jsonb_agg(x ORDER BY x.views DESC)
      FROM (
        SELECT e.product_id,
               coalesce(p.name, e.product_id) AS name,
               p.slug, p.price, p.stock, p.is_active,
               count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS views,
               count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_ADD_TO_CART') AS add_to_cart
        FROM ev_s e
        LEFT JOIN public.products p
          ON p.id::text = e.product_id
        WHERE e.product_id IS NOT NULL
        GROUP BY e.product_id, p.name, p.slug, p.price, p.stock, p.is_active
        ORDER BY views DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'landing_pages', coalesce((
      SELECT jsonb_agg(x ORDER BY x.sessions DESC)
      FROM (
        SELECT coalesce(nullif(landing_page, ''), '(unknown)') AS page, count(*) AS sessions
        FROM sess GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      ) x
    ), '[]'::jsonb),
    'countries', coalesce((
      SELECT jsonb_agg(x ORDER BY x.sessions DESC)
      FROM (
        SELECT coalesce(nullif(country, ''), 'unknown') AS country, count(*) AS sessions
        FROM sess GROUP BY 1 ORDER BY 2 DESC LIMIT 15
      ) x
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      SELECT jsonb_agg(x ORDER BY x.created_at DESC)
      FROM (
        SELECT id, created_at, total_amount, currency, status
        FROM ord ORDER BY created_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gp_unified_analytics(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gp_unified_analytics(integer) TO authenticated;