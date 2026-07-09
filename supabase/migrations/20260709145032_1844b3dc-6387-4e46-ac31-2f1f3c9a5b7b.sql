
CREATE OR REPLACE VIEW public.v_organic_product_ranking_30d AS
WITH ok_sessions AS (
  SELECT session_id
  FROM public.canonical_sessions_traffic_class
  WHERE organic_flag = true
    AND bot_flag = false
    AND internal_flag = false
    AND COALESCE(attribution_confidence, 0) >= 0.5
    AND last_seen_at >= now() - interval '30 days'
),
ev AS (
  SELECT e.product_id::text AS product_id,
         e.session_id,
         e.canonical_name::text AS ev,
         e.value_cents
  FROM public.canonical_events e
  JOIN ok_sessions s ON s.session_id = e.session_id
  WHERE e.product_id IS NOT NULL
    AND e.occurred_at >= now() - interval '30 days'
)
SELECT
  product_id,
  COUNT(DISTINCT session_id)                                                     AS organic_sessions,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_PRODUCT_VIEW')                          AS organic_product_views,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_ADD_TO_CART')                           AS organic_add_to_cart,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_CHECKOUT')                              AS organic_checkout_started,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_PURCHASE')                              AS organic_purchases,
  COALESCE(SUM(value_cents) FILTER (WHERE ev = 'CANONICAL_PURCHASE'), 0)::bigint AS organic_revenue_cents,
  ( COUNT(*) FILTER (WHERE ev = 'CANONICAL_PURCHASE')     * 1000.0
  + COUNT(*) FILTER (WHERE ev = 'CANONICAL_ADD_TO_CART')  *   50.0
  + COUNT(*) FILTER (WHERE ev = 'CANONICAL_PRODUCT_VIEW') *    2.0
  + COUNT(DISTINCT session_id)                            *    1.0
  ) AS organic_rank_score
FROM ev
GROUP BY product_id;

GRANT SELECT ON public.v_organic_product_ranking_30d TO authenticated;
GRANT ALL    ON public.v_organic_product_ranking_30d TO service_role;

CREATE OR REPLACE VIEW public.v_organic_pin_ranking_30d AS
WITH ok_sessions AS (
  SELECT session_id
  FROM public.canonical_sessions_traffic_class
  WHERE organic_flag = true
    AND bot_flag = false
    AND internal_flag = false
    AND COALESCE(attribution_confidence, 0) >= 0.5
    AND last_seen_at >= now() - interval '30 days'
),
ev AS (
  SELECT NULLIF(e.utm_campaign, '') AS pin_id,
         e.session_id,
         e.canonical_name::text AS ev,
         e.value_cents
  FROM public.canonical_events e
  JOIN ok_sessions s ON s.session_id = e.session_id
  WHERE e.occurred_at >= now() - interval '30 days'
    AND NULLIF(e.utm_campaign, '') IS NOT NULL
)
SELECT
  pin_id,
  COUNT(DISTINCT session_id)                                                     AS organic_sessions,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_PRODUCT_VIEW')                          AS organic_product_views,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_ADD_TO_CART')                           AS organic_add_to_cart,
  COUNT(*) FILTER (WHERE ev = 'CANONICAL_PURCHASE')                              AS organic_purchases,
  COALESCE(SUM(value_cents) FILTER (WHERE ev = 'CANONICAL_PURCHASE'), 0)::bigint AS organic_revenue_cents,
  ( COUNT(*) FILTER (WHERE ev = 'CANONICAL_PURCHASE')     * 1000.0
  + COUNT(*) FILTER (WHERE ev = 'CANONICAL_ADD_TO_CART')  *   50.0
  + COUNT(*) FILTER (WHERE ev = 'CANONICAL_PRODUCT_VIEW') *    2.0
  + COUNT(DISTINCT session_id)                            *    1.0
  ) AS organic_rank_score
FROM ev
GROUP BY pin_id;

GRANT SELECT ON public.v_organic_pin_ranking_30d TO authenticated;
GRANT ALL    ON public.v_organic_pin_ranking_30d TO service_role;

CREATE OR REPLACE VIEW public.v_organic_ranking_health AS
SELECT
  (SELECT COUNT(*) FROM public.canonical_sessions_traffic_class
     WHERE last_seen_at >= now() - interval '30 days' AND organic_flag AND NOT bot_flag AND NOT internal_flag
       AND COALESCE(attribution_confidence,0) >= 0.5)                              AS organic_sessions_30d,
  (SELECT COUNT(*) FROM public.canonical_sessions_traffic_class
     WHERE last_seen_at >= now() - interval '30 days' AND paid_flag)               AS paid_sessions_30d,
  (SELECT COUNT(*) FROM public.canonical_sessions_traffic_class
     WHERE last_seen_at >= now() - interval '30 days' AND internal_flag)           AS internal_sessions_30d,
  (SELECT COUNT(*) FROM public.canonical_sessions_traffic_class
     WHERE last_seen_at >= now() - interval '30 days' AND bot_flag)                AS bot_sessions_30d,
  (SELECT COUNT(*) FROM public.canonical_sessions_traffic_class
     WHERE last_seen_at >= now() - interval '30 days' AND COALESCE(attribution_confidence,0) < 0.5
       AND NOT organic_flag AND NOT paid_flag)                                     AS low_confidence_excluded_30d,
  (SELECT COUNT(*) FROM public.v_organic_product_ranking_30d)                      AS ranked_products,
  (SELECT COUNT(*) FROM public.v_organic_pin_ranking_30d)                          AS ranked_pins,
  now()                                                                            AS computed_at;

GRANT SELECT ON public.v_organic_ranking_health TO authenticated;
GRANT ALL    ON public.v_organic_ranking_health TO service_role;
