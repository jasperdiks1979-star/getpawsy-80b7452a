DROP FUNCTION IF EXISTS public.analytics_canonical_session_agg_json(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.analytics_canonical_session_agg(timestamptz, timestamptz);

CREATE FUNCTION public.analytics_canonical_session_agg(
  p_since timestamptz,
  p_until timestamptz
)
RETURNS TABLE (
  session_id text,
  visitor_id text,
  country text,
  city text,
  latitude double precision,
  longitude double precision,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  page_views integer,
  device text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  page_path text,
  landing_page text,
  has_product_view boolean,
  has_add_to_cart boolean,
  has_view_cart boolean,
  has_checkout boolean,
  has_purchase boolean,
  order_value numeric,
  va_is_internal boolean,
  f_has_flags boolean,
  f_is_internal boolean,
  f_is_bot boolean,
  f_technical_path boolean,
  f_exclude_from_commercial boolean,
  f_traffic_class text,
  f_traffic_quality text,
  f_effective_duration_seconds numeric,
  f_duration_evidence_source text,
  f_interaction_count integer,
  f_engagement_ms numeric,
  f_classification_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ev_agg AS (
    SELECT
      e.session_id::text AS session_id,
      (array_agg(e.visitor_id ORDER BY e.occurred_at) FILTER (WHERE e.visitor_id IS NOT NULL))[1]::text AS visitor_id,
      (array_agg(e.country ORDER BY e.occurred_at) FILTER (WHERE e.country IS NOT NULL))[1]::text AS country,
      (array_agg(e.city ORDER BY e.occurred_at) FILTER (WHERE e.city IS NOT NULL))[1]::text AS city,
      min(e.occurred_at) AS first_seen_at,
      max(e.occurred_at) AS last_seen_at,
      count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PAGE_VIEW')::int AS page_views,
      (array_agg(e.device ORDER BY e.occurred_at) FILTER (WHERE e.device IS NOT NULL))[1]::text AS device,
      (array_agg(e.utm_source ORDER BY e.occurred_at))[1]::text AS utm_source,
      (array_agg(e.utm_medium ORDER BY e.occurred_at))[1]::text AS utm_medium,
      (array_agg(e.utm_campaign ORDER BY e.occurred_at) FILTER (WHERE e.utm_campaign IS NOT NULL))[1]::text AS utm_campaign,
      (array_agg(e.utm_content ORDER BY e.occurred_at) FILTER (WHERE e.utm_content IS NOT NULL))[1]::text AS utm_content,
      (array_agg(e.referrer ORDER BY e.occurred_at))[1]::text AS referrer,
      (array_agg(e.page_path ORDER BY e.occurred_at))[1]::text AS page_path,
      (array_agg(e.landing_page ORDER BY e.occurred_at) FILTER (WHERE e.landing_page IS NOT NULL))[1]::text AS landing_page,
      bool_or(e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS has_product_view,
      bool_or(e.canonical_name = 'CANONICAL_ADD_TO_CART') AS has_add_to_cart,
      bool_or(e.canonical_name = 'CANONICAL_CART') AS has_view_cart,
      bool_or(e.canonical_name = 'CANONICAL_CHECKOUT') AS has_checkout,
      bool_or(e.canonical_name = 'CANONICAL_PURCHASE') AS has_purchase
    FROM canonical_events e
    WHERE e.occurred_at >= p_since
      AND e.occurred_at <= p_until
      AND e.session_id IS NOT NULL
    GROUP BY e.session_id
  ),
  va_sess AS (
    SELECT
      v.session_id::text AS session_id,
      max(v.latitude)::double precision AS latitude,
      max(v.longitude)::double precision AS longitude,
      (array_agg(v.country) FILTER (WHERE v.country IS NOT NULL))[1]::text AS country,
      (array_agg(v.city) FILTER (WHERE v.city IS NOT NULL))[1]::text AS city,
      bool_or(v.is_internal) AS is_internal,
      (array_agg(v.utm_campaign) FILTER (WHERE v.utm_campaign IS NOT NULL))[1]::text AS utm_campaign,
      coalesce(max(v.order_value), 0)::numeric AS order_value
    FROM visitor_activity v
    WHERE v.created_at >= p_since AND v.created_at <= p_until AND v.session_id IS NOT NULL
    GROUP BY v.session_id
  ),
  va_vis AS (
    SELECT
      v.visitor_id::text AS visitor_id,
      max(v.latitude)::double precision AS latitude,
      max(v.longitude)::double precision AS longitude,
      (array_agg(v.country) FILTER (WHERE v.country IS NOT NULL))[1]::text AS country,
      (array_agg(v.city) FILTER (WHERE v.city IS NOT NULL))[1]::text AS city,
      bool_or(v.is_internal) AS is_internal,
      (array_agg(v.utm_campaign) FILTER (WHERE v.utm_campaign IS NOT NULL))[1]::text AS utm_campaign,
      coalesce(max(v.order_value), 0)::numeric AS order_value
    FROM visitor_activity v
    WHERE v.created_at >= p_since AND v.created_at <= p_until AND v.visitor_id IS NOT NULL
    GROUP BY v.visitor_id
  )
  SELECT
    a.session_id,
    a.visitor_id,
    coalesce(a.country, s.country, w.country) AS country,
    coalesce(a.city, s.city, w.city) AS city,
    coalesce(s.latitude, w.latitude) AS latitude,
    coalesce(s.longitude, w.longitude) AS longitude,
    a.first_seen_at,
    a.last_seen_at,
    a.page_views,
    a.device,
    a.utm_source,
    a.utm_medium,
    coalesce(a.utm_campaign, s.utm_campaign, w.utm_campaign) AS utm_campaign,
    a.utm_content,
    a.referrer,
    a.page_path,
    a.landing_page,
    coalesce(a.has_product_view, false),
    coalesce(a.has_add_to_cart, false),
    coalesce(a.has_view_cart, false),
    coalesce(a.has_checkout, false),
    coalesce(a.has_purchase, false),
    greatest(coalesce(s.order_value, 0), coalesce(w.order_value, 0))::numeric AS order_value,
    coalesce(s.is_internal, false) OR coalesce(w.is_internal, false) AS va_is_internal,
    (c.session_id IS NOT NULL) AS f_has_flags,
    coalesce(c.is_internal, false),
    coalesce(c.is_bot, false),
    coalesce(c.technical_path, false),
    coalesce(c.exclude_from_commercial, false),
    c.traffic_class::text,
    c.traffic_quality::text,
    c.effective_duration_seconds::numeric,
    c.duration_evidence_source::text,
    c.interaction_count::int,
    c.engagement_ms::numeric,
    c.classification_reason::text
  FROM ev_agg a
  LEFT JOIN va_sess s ON s.session_id = a.session_id
  LEFT JOIN va_vis  w ON w.visitor_id = a.visitor_id
  LEFT JOIN canonical_sessions c ON c.session_id = a.session_id
$$;

CREATE FUNCTION public.analytics_canonical_session_agg_json(
  p_since timestamptz,
  p_until timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM public.analytics_canonical_session_agg(p_since, p_until) t
$$;

REVOKE ALL ON FUNCTION public.analytics_canonical_session_agg(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_canonical_session_agg_json(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_canonical_session_agg(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_canonical_session_agg_json(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_canonical_session_agg(timestamptz, timestamptz) TO postgres;
GRANT EXECUTE ON FUNCTION public.analytics_canonical_session_agg_json(timestamptz, timestamptz) TO postgres;