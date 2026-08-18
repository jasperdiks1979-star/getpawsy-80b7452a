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

  WITH sess AS MATERIALIZED (
    SELECT s.session_id, s.first_seen_at, s.classified_channel,
           s.utm_source, s.utm_campaign, s.utm_content, s.order_id,
           s.country, s.landing_page
    FROM public.canonical_sessions s
    WHERE s.first_seen_at >= v_from
      AND coalesce(s.exclude_from_commercial, false) = false
  ),
  ev_s AS MATERIALIZED (
    SELECT e.session_id, e.canonical_name::text AS canonical_name, e.occurred_at, e.product_id
    FROM public.canonical_events e
    JOIN sess s ON s.session_id = e.session_id
    WHERE e.occurred_at >= v_from
      AND coalesce(e.technical_path, false) = false
  ),
  ord AS MATERIALIZED (
    SELECT o.id, o.created_at, o.total_amount, o.currency, o.status
    FROM public.orders o
    WHERE o.created_at >= v_from AND o.status = 'paid'
  ),
  ev_totals AS (
    SELECT
      count(*) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS product_views,
      count(*) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART') AS add_to_cart,
      count(*) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT') AS checkouts
    FROM ev_s
  ),
  d_sess AS (
    SELECT first_seen_at::date AS day, count(*) AS sessions FROM sess GROUP BY 1
  ),
  d_ev AS (
    SELECT occurred_at::date AS day,
           count(*) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS product_views,
           count(*) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART') AS add_to_cart
    FROM ev_s GROUP BY 1
  ),
  d_ord AS (
    SELECT created_at::date AS day, count(*) AS orders, coalesce(sum(total_amount), 0) AS revenue
    FROM ord GROUP BY 1
  ),
  series AS (
    SELECT g::date AS day FROM generate_series(v_from::date, now()::date, interval '1 day') g
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_hours', p_hours,
    'from', v_from,
    'kpis', jsonb_build_object(
      'sessions', (SELECT count(*) FROM sess),
      'product_views', (SELECT product_views FROM ev_totals),
      'add_to_cart', (SELECT add_to_cart FROM ev_totals),
      'checkouts', (SELECT checkouts FROM ev_totals),
      'orders', (SELECT count(*) FROM ord),
      'revenue', (SELECT coalesce(sum(total_amount), 0) FROM ord),
      'pinterest_sessions', (SELECT count(*) FROM sess WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%')
    ),
    'timeseries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', s.day,
        'sessions', coalesce(ds.sessions, 0),
        'product_views', coalesce(de.product_views, 0),
        'add_to_cart', coalesce(de.add_to_cart, 0),
        'orders', coalesce(do_.orders, 0),
        'revenue', coalesce(do_.revenue, 0)
      ) ORDER BY s.day)
      FROM series s
      LEFT JOIN d_sess ds ON ds.day = s.day
      LEFT JOIN d_ev de ON de.day = s.day
      LEFT JOIN d_ord do_ ON do_.day = s.day
    ), '[]'::jsonb),
    'sources', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(nullif(classified_channel, ''), 'unknown') AS channel,
               count(*) AS sessions,
               count(*) FILTER (WHERE order_id IS NOT NULL) AS orders
        FROM sess GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'campaigns', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(nullif(utm_campaign, ''), '(none)') AS campaign,
               coalesce(nullif(utm_source, ''), '(none)') AS source,
               count(*) AS sessions,
               count(*) FILTER (WHERE order_id IS NOT NULL) AS orders
        FROM sess WHERE utm_campaign IS NOT NULL AND utm_campaign <> ''
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30
      ) x
    ), '[]'::jsonb),
    'pinterest_pins', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(nullif(utm_content, ''), '(none)') AS pin,
               coalesce(nullif(utm_campaign, ''), '(none)') AS campaign,
               count(*) AS sessions,
               count(DISTINCT landing_page) AS landing_pages
        FROM sess WHERE lower(coalesce(utm_source, classified_channel, '')) LIKE '%pinterest%'
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50
      ) x
    ), '[]'::jsonb),
    'products', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.views DESC) FROM (
        SELECT e.product_id,
               coalesce(p.name, e.product_id) AS name,
               p.slug, p.price, p.stock, p.is_active,
               count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS views,
               count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_ADD_TO_CART') AS add_to_cart
        FROM ev_s e
        LEFT JOIN public.products p ON p.id::text = e.product_id
        WHERE e.product_id IS NOT NULL
        GROUP BY e.product_id, p.name, p.slug, p.price, p.stock, p.is_active
        ORDER BY 7 DESC LIMIT 25
      ) x
    ), '[]'::jsonb),
    'landing_pages', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(nullif(landing_page, ''), '(unknown)') AS page, count(*) AS sessions
        FROM sess GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      ) x
    ), '[]'::jsonb),
    'countries', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sessions DESC) FROM (
        SELECT coalesce(nullif(country, ''), 'unknown') AS country, count(*) AS sessions
        FROM sess GROUP BY 1 ORDER BY 2 DESC LIMIT 15
      ) x
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT id, created_at, total_amount, currency, status
        FROM ord ORDER BY created_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;