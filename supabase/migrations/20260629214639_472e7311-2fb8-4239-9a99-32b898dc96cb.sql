
CREATE OR REPLACE VIEW public.gv3_mi_first_sale_plan_v
WITH (security_invoker = true) AS
WITH pi AS (
  SELECT product_id, overall_score, pinterest_score, seo_score, confidence_score,
         classification, revenue_cents, purchases, add_to_carts, product_views
    FROM public.gv3_pi_scores
),
pin AS (
  SELECT product_id, pinterest_growth_score, predicted_opportunity,
         confidence AS pin_confidence_raw, pinterest_saturation,
         classification AS pin_classification
    FROM public.gv3_pin_growth_scores
),
base AS (
  SELECT
    p.id AS product_id,
    p.name AS title,
    p.slug AS handle,
    p.price,
    COALESCE(pi.overall_score, 0)            AS pi_score,
    COALESCE(pi.confidence_score, 0)         AS pi_confidence,
    COALESCE(pi.pinterest_score, 0)          AS pi_pinterest_score,
    COALESCE(pi.seo_score, 0)                AS pi_seo_score,
    COALESCE(pi.revenue_cents, 0)            AS revenue_cents,
    COALESCE(pi.purchases, 0)                AS purchases,
    COALESCE(pi.add_to_carts, 0)             AS add_to_carts,
    COALESCE(pi.product_views, 0)            AS product_views,
    COALESCE(pin.pinterest_growth_score, 0)  AS pin_growth_score,
    COALESCE(pin.predicted_opportunity, 0)   AS predicted_opportunity,
    COALESCE(pin.pin_confidence_raw, 0)      AS pin_confidence,
    COALESCE(pin.pinterest_saturation, 0)    AS pin_saturation,
    pi.classification                        AS pi_classification,
    pin.pin_classification                   AS pin_classification
  FROM public.products p
  LEFT JOIN pi  ON pi.product_id  = p.id
  LEFT JOIN pin ON pin.product_id = p.id
  WHERE p.is_active = true
),
lanes AS (
  SELECT
    *,
    (pi_score * 0.6 + pin_growth_score * 0.4)                                         AS lane_probability,
    (predicted_opportunity * 0.7 + pi_score * 0.3)                                    AS lane_revenue,
    (pin_growth_score * 0.7 + pi_pinterest_score * 0.3)                               AS lane_pinterest,
    (pi_seo_score * 0.7 + pi_score * 0.3)                                             AS lane_google,
    CASE WHEN product_views > 0
         THEN LEAST(100, (add_to_carts::numeric / NULLIF(product_views,0)) * 1000)
         ELSE 0 END                                                                   AS lane_impulse,
    GREATEST(0, predicted_opportunity - pin_saturation)                               AS lane_urgency,
    LEAST(pi_confidence, pin_confidence)                                              AS min_confidence
  FROM base
)
SELECT
  product_id, title, handle, price,
  pi_classification, pin_classification,
  revenue_cents, purchases, add_to_carts, product_views,
  pi_score, pi_confidence, pi_pinterest_score, pi_seo_score,
  pin_growth_score, predicted_opportunity, pin_confidence, pin_saturation,
  lane_probability, lane_revenue, lane_pinterest, lane_google,
  lane_impulse, lane_urgency,
  ROUND(((lane_probability + lane_revenue + lane_pinterest + lane_google
          + lane_impulse + lane_urgency) / 6.0)::numeric, 2)                          AS composite_score,
  min_confidence,
  ROUND((predicted_opportunity * 0.1)::numeric, 2)                                    AS expected_revenue_eur
FROM lanes
ORDER BY composite_score DESC;

GRANT SELECT ON public.gv3_mi_first_sale_plan_v TO authenticated;
GRANT SELECT ON public.gv3_mi_first_sale_plan_v TO service_role;

COMMENT ON VIEW public.gv3_mi_first_sale_plan_v IS
  'Genesis V3.3 First Sale AI — deterministic daily plan derived from gv3_pi_scores, gv3_pin_growth_scores and products. No fabricated metrics; RLS inherited via security_invoker.';
