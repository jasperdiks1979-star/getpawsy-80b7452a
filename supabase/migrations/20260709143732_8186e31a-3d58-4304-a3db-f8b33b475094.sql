
CREATE OR REPLACE VIEW public.canonical_traffic_class_funnel_24h
WITH (security_invoker = true) AS
WITH sess AS (
  SELECT session_id, visitor_id, traffic_class, traffic_channel, attribution_confidence
  FROM public.canonical_sessions_traffic_class
  WHERE last_seen_at > now() - interval '24 hours'
),
ev AS (
  SELECT session_id, canonical_name, value_cents
  FROM public.canonical_events
  WHERE occurred_at > now() - interval '24 hours'
)
SELECT
  s.traffic_class,
  count(DISTINCT s.session_id)                                                                          AS sessions,
  count(DISTINCT s.visitor_id)                                                                          AS visitors,
  count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PAGE_VIEW')                                     AS page_views,
  count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PRODUCT_VIEW')                                  AS product_views,
  count(DISTINCT s.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_ADD_TO_CART')               AS add_to_cart,
  count(DISTINCT s.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_CHECKOUT')                  AS checkout_started,
  count(DISTINCT s.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_PURCHASE')                  AS purchases,
  COALESCE(SUM(e.value_cents) FILTER (WHERE e.canonical_name = 'CANONICAL_PURCHASE'), 0)               AS revenue_cents,
  ROUND(AVG(s.attribution_confidence)::numeric, 3)                                                     AS avg_attribution_confidence
FROM sess s
LEFT JOIN ev e USING (session_id)
GROUP BY s.traffic_class
ORDER BY sessions DESC;

GRANT SELECT ON public.canonical_traffic_class_funnel_24h TO authenticated, anon, service_role;
