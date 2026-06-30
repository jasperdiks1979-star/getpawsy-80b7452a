
-- First Sale Sprint: priority view joining MI plan + hunter + engagement.
CREATE OR REPLACE VIEW public.gv_first_sale_priority_v AS
WITH eng AS (
  SELECT product_id,
         SUM(impressions) AS combo_impressions,
         SUM(saves) AS combo_saves,
         SUM(clicks) AS combo_clicks,
         SUM(purchases) AS combo_purchases,
         MAX(confidence_wilson) AS combo_max_confidence
  FROM public.gv36_combo_performance
  GROUP BY product_id
),
aud AS (
  SELECT product_id,
         MAX(match_score) AS best_audience_match,
         MAX(buying_probability) AS best_buying_prob,
         (ARRAY_AGG(persona_id ORDER BY buying_probability DESC NULLS LAST))[1] AS best_persona_id
  FROM public.gv35_product_audience_match
  GROUP BY product_id
)
SELECT
  mi.product_id,
  mi.title,
  mi.handle,
  mi.price,
  mi.pi_score,
  mi.pi_confidence,
  mi.pin_growth_score,
  mi.pin_confidence,
  mi.composite_score AS mi_composite,
  mi.min_confidence AS mi_min_confidence,
  mi.expected_revenue_eur,
  mi.lane_probability,
  h.us_stock,
  h.is_us_warehouse,
  h.is_fast_shipping,
  h.shipping_score,
  h.margin_percent,
  h.hunter_score,
  COALESCE(a.best_audience_match, 0)   AS best_audience_match,
  COALESCE(a.best_buying_prob, 0)      AS best_buying_prob,
  a.best_persona_id,
  COALESCE(e.combo_impressions, 0)     AS combo_impressions,
  COALESCE(e.combo_saves, 0)           AS combo_saves,
  COALESCE(e.combo_purchases, 0)       AS combo_purchases,
  COALESCE(e.combo_max_confidence, 0)  AS combo_max_confidence,
  -- Gate: all 9 criteria must be true. Tuned to current data ranges.
  (
    COALESCE(mi.pi_confidence, 0)        >= 70 AND
    COALESCE(mi.pin_growth_score, 0)     >= 60 AND
    COALESCE(a.best_buying_prob, 0)      >= 0.4 AND
    COALESCE(h.margin_percent, 0)        >= 30 AND
    COALESCE(h.us_stock, 0)              >  0 AND
    COALESCE(h.shipping_score, 0)        >= 60 AND
    COALESCE(h.hunter_score, 0)          >= 40 AND
    COALESCE(mi.composite_score, 0)      >= 50 AND
    COALESCE(mi.min_confidence, 0)       >= 50
  ) AS gate_passed,
  -- Priority score: weighted blend; favors confident MI plan + audience match + engagement.
  ROUND((
    0.30 * LEAST(COALESCE(mi.composite_score, 0), 100) +
    0.20 * LEAST(COALESCE(h.hunter_score, 0), 100) +
    0.20 * (100 * COALESCE(a.best_buying_prob, 0)) +
    0.15 * LEAST(COALESCE(mi.pin_growth_score, 0), 100) +
    0.10 * LEAST(COALESCE(e.combo_impressions, 0) / 10.0, 100) +
    0.05 * LEAST(COALESCE(h.margin_percent, 0), 100)
  )::numeric, 2) AS priority_score
FROM public.gv3_mi_first_sale_plan_v mi
LEFT JOIN public.gv34_first_sale_hunter_v h ON h.product_id = mi.product_id
LEFT JOIN aud a ON a.product_id = mi.product_id
LEFT JOIN eng e ON e.product_id = mi.product_id;

GRANT SELECT ON public.gv_first_sale_priority_v TO authenticated;
GRANT SELECT ON public.gv_first_sale_priority_v TO service_role;
