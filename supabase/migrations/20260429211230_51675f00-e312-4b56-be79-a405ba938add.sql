CREATE OR REPLACE FUNCTION public.get_tiktok_variant_kpis(
  p_start timestamptz,
  p_end timestamptz,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE(
  utm_campaign text,
  utm_content text,
  impressions bigint,
  clicks bigint,
  pdp_views bigint,
  add_to_carts bigint,
  purchases bigint,
  revenue numeric,
  ctr numeric,
  view_to_atc numeric,
  view_to_purchase numeric,
  arpv numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(utm_campaign, ''), '(none)') AS utm_campaign,
      COALESCE(NULLIF(utm_content, ''), '(none)') AS utm_content,
      event_name,
      COALESCE(value, 0) AS value
    FROM public.lp_funnel_events
    WHERE created_at >= p_start
      AND created_at <  p_end
      AND (p_include_internal OR is_internal = false)
  ),
  agg AS (
    SELECT
      utm_campaign,
      utm_content,
      COUNT(*) FILTER (WHERE event_name = 'lp_view')                AS impressions,
      COUNT(*) FILTER (WHERE event_name = 'lp_cta_click')           AS clicks,
      COUNT(*) FILTER (WHERE event_name IN ('pdp_view','view_item'))AS pdp_views,
      COUNT(*) FILTER (WHERE event_name = 'add_to_cart')            AS add_to_carts,
      COUNT(*) FILTER (WHERE event_name = 'purchase')               AS purchases,
      COALESCE(SUM(value) FILTER (WHERE event_name = 'purchase'), 0) AS revenue
    FROM base
    GROUP BY utm_campaign, utm_content
  )
  SELECT
    utm_campaign,
    utm_content,
    impressions,
    clicks,
    pdp_views,
    add_to_carts,
    purchases,
    revenue,
    CASE WHEN impressions > 0 THEN (clicks::numeric / impressions) * 100 ELSE 0 END AS ctr,
    CASE WHEN impressions > 0 THEN (add_to_carts::numeric / impressions) * 100 ELSE 0 END AS view_to_atc,
    CASE WHEN impressions > 0 THEN (purchases::numeric / impressions) * 100 ELSE 0 END AS view_to_purchase,
    CASE WHEN impressions > 0 THEN revenue / impressions ELSE 0 END AS arpv
  FROM agg
  ORDER BY impressions DESC, utm_campaign;
$$;

GRANT EXECUTE ON FUNCTION public.get_tiktok_variant_kpis(timestamptz, timestamptz, boolean)
  TO authenticated;
