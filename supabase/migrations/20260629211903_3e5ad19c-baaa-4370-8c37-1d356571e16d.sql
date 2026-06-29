
CREATE OR REPLACE VIEW public.autopilot_outcomes_24h
WITH (security_invoker = true) AS
SELECT
  a.id AS action_id,
  a.kind,
  a.product_id,
  a.priority,
  a.expected_revenue_eur,
  a.expected_roi,
  a.executed_at,
  COALESCE(SUM(CASE WHEN ce.canonical_name::text = 'view_item'      THEN 1 ELSE 0 END), 0) AS views_24h,
  COALESCE(SUM(CASE WHEN ce.canonical_name::text = 'add_to_cart'    THEN 1 ELSE 0 END), 0) AS atc_24h,
  COALESCE(SUM(CASE WHEN ce.canonical_name::text = 'begin_checkout' THEN 1 ELSE 0 END), 0) AS checkout_24h,
  COALESCE(SUM(CASE WHEN ce.canonical_name::text = 'purchase'       THEN 1 ELSE 0 END), 0) AS purchases_24h,
  COALESCE(SUM(CASE WHEN ce.canonical_name::text = 'purchase'
                    THEN COALESCE(ce.value_cents, 0) ELSE 0 END), 0)::numeric / 100.0
    AS revenue_eur_24h
FROM public.autopilot_actions a
LEFT JOIN public.canonical_events ce
  ON ce.product_id = a.product_id::text
 AND ce.occurred_at >= a.executed_at
 AND ce.occurred_at <  a.executed_at + interval '24 hours'
WHERE a.executed_at IS NOT NULL
GROUP BY a.id;

GRANT SELECT ON public.autopilot_outcomes_24h TO authenticated;
GRANT SELECT ON public.autopilot_outcomes_24h TO service_role;
