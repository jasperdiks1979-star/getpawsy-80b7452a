
-- ============================================================================
-- REAL HUMAN INTELLIGENCE CONSTITUTION — KPI VIEWS
-- Extends the existing real_human_sessions classifier into canonical KPI
-- surfaces. No new tables. No new dashboards. No duplicate logic.
-- All views are SECURITY INVOKER so admin RLS on underlying tables applies.
-- ============================================================================

-- 1. Real-Human Funnel (last 7d) ---------------------------------------------
CREATE OR REPLACE VIEW public.real_human_funnel_7d
WITH (security_invoker = true)
AS
WITH humans AS (
  SELECT session_id
  FROM public.real_human_sessions
  WHERE first_seen_at >= now() - interval '7 days'
),
ev AS (
  SELECT ce.session_id, ce.canonical_name
  FROM public.canonical_events ce
  JOIN humans h ON h.session_id = ce.session_id
  WHERE ce.occurred_at >= now() - interval '7 days'
)
SELECT
  (SELECT count(*) FROM humans)                                                                  AS real_human_sessions,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW')            AS real_pdp_views,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')             AS real_add_to_carts,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT')                AS real_checkouts,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')                AS real_purchases,
  ROUND(
    100.0 * count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')
    / NULLIF((SELECT count(*) FROM humans), 0)
  , 3)                                                                                            AS real_conversion_rate_pct
FROM ev;

GRANT SELECT ON public.real_human_funnel_7d TO authenticated;

-- 2. Real-Human Channel Quality (last 7d) ------------------------------------
CREATE OR REPLACE VIEW public.real_human_channel_quality_7d
WITH (security_invoker = true)
AS
WITH sess AS (
  SELECT
    cs.session_id,
    COALESCE(NULLIF(cs.utm_source, ''), NULLIF(cs.classified_channel, ''), 'direct') AS channel,
    public.is_real_human_session(
      cs.session_id, cs.first_seen_at, cs.last_seen_at, cs.landing_page, cs.referrer,
      cs.utm_source, cs.utm_medium, cs.utm_campaign, cs.country, cs.device, cs.browser,
      cs.os, cs.screen_wxh, tse.is_bot, tse.is_internal, tse.bucket
    ) AS is_human
  FROM public.canonical_sessions cs
  LEFT JOIN public.tsi_session_enrichment tse ON tse.session_id = cs.session_id
  WHERE cs.first_seen_at >= now() - interval '7 days'
),
outcomes AS (
  SELECT
    s.channel,
    s.session_id,
    s.is_human,
    max((ce.canonical_name = 'CANONICAL_PRODUCT_VIEW')::int) AS had_pdp,
    max((ce.canonical_name = 'CANONICAL_ADD_TO_CART')::int)  AS had_atc,
    max((ce.canonical_name = 'CANONICAL_CHECKOUT')::int)     AS had_checkout,
    max((ce.canonical_name = 'CANONICAL_PURCHASE')::int)     AS had_purchase,
    coalesce(sum(ce.value_cents) FILTER (WHERE ce.canonical_name = 'CANONICAL_PURCHASE'), 0) AS revenue_cents
  FROM sess s
  LEFT JOIN public.canonical_events ce
    ON ce.session_id = s.session_id
   AND ce.occurred_at >= now() - interval '7 days'
  GROUP BY s.channel, s.session_id, s.is_human
)
SELECT
  channel,
  count(*)                                                                    AS total_sessions,
  count(*) FILTER (WHERE is_human)                                            AS human_sessions,
  count(*) FILTER (WHERE NOT is_human)                                        AS bot_sessions,
  ROUND(100.0 * count(*) FILTER (WHERE is_human) / NULLIF(count(*), 0), 2)    AS human_pct,
  sum(had_pdp)      FILTER (WHERE is_human)                                   AS real_pdp_views,
  sum(had_atc)      FILTER (WHERE is_human)                                   AS real_atc,
  sum(had_checkout) FILTER (WHERE is_human)                                   AS real_checkouts,
  sum(had_purchase) FILTER (WHERE is_human)                                   AS real_purchases,
  sum(revenue_cents) FILTER (WHERE is_human)                                  AS real_revenue_cents,
  ROUND(
    100.0 * sum(had_atc)      FILTER (WHERE is_human)
    / NULLIF(count(*) FILTER (WHERE is_human), 0)
  , 2)                                                                        AS real_atc_rate_pct,
  ROUND(
    100.0 * sum(had_purchase) FILTER (WHERE is_human)
    / NULLIF(count(*) FILTER (WHERE is_human), 0)
  , 2)                                                                        AS real_purchase_rate_pct,
  ROUND(
    sum(revenue_cents) FILTER (WHERE is_human)::numeric / 100.0
    / NULLIF(count(*) FILTER (WHERE is_human), 0)
  , 4)                                                                        AS real_revenue_per_human,
  LEAST(1.0, count(*) FILTER (WHERE is_human)::numeric / 30.0)                AS confidence
FROM outcomes
GROUP BY channel
ORDER BY real_revenue_cents DESC NULLS LAST, human_sessions DESC;

GRANT SELECT ON public.real_human_channel_quality_7d TO authenticated;

-- 3. Real-Human Product Ranking (last 7d) ------------------------------------
CREATE OR REPLACE VIEW public.real_human_product_ranking_7d
WITH (security_invoker = true)
AS
WITH humans AS (
  SELECT session_id FROM public.real_human_sessions
  WHERE first_seen_at >= now() - interval '7 days'
),
ev AS (
  SELECT ce.product_id, ce.session_id, ce.canonical_name, ce.value_cents
  FROM public.canonical_events ce
  JOIN humans h ON h.session_id = ce.session_id
  WHERE ce.occurred_at >= now() - interval '7 days'
    AND ce.product_id IS NOT NULL
)
SELECT
  product_id,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS real_views,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')  AS real_atc,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT')     AS real_checkouts,
  count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')     AS real_purchases,
  coalesce(sum(value_cents) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE'), 0)  AS real_revenue_cents,
  ROUND(
    100.0 * count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')
    / NULLIF(count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW'), 0)
  , 2) AS real_atc_rate_pct,
  ROUND(
    100.0 * count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')
    / NULLIF(count(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW'), 0)
  , 2) AS real_conversion_rate_pct
FROM ev
GROUP BY product_id
ORDER BY real_revenue_cents DESC NULLS LAST, real_atc DESC, real_views DESC;

GRANT SELECT ON public.real_human_product_ranking_7d TO authenticated;

-- 4. Classifier self-validation (last 7d) ------------------------------------
CREATE OR REPLACE VIEW public.real_human_classifier_confidence_7d
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    cs.session_id,
    public.is_real_human_session(
      cs.session_id, cs.first_seen_at, cs.last_seen_at, cs.landing_page, cs.referrer,
      cs.utm_source, cs.utm_medium, cs.utm_campaign, cs.country, cs.device, cs.browser,
      cs.os, cs.screen_wxh, tse.is_bot, tse.is_internal, tse.bucket
    ) AS is_human,
    (tse.session_id IS NOT NULL) AS enrichment_present,
    EXISTS (
      SELECT 1 FROM public.canonical_events ce
      WHERE ce.session_id = cs.session_id
        AND ce.canonical_name IN ('CANONICAL_ADD_TO_CART','CANONICAL_CHECKOUT','CANONICAL_PURCHASE')
    ) AS had_commercial_intent
  FROM public.canonical_sessions cs
  LEFT JOIN public.tsi_session_enrichment tse ON tse.session_id = cs.session_id
  WHERE cs.first_seen_at >= now() - interval '7 days'
)
SELECT
  count(*)                                                            AS total_sessions,
  count(*) FILTER (WHERE is_human)                                    AS classified_human,
  count(*) FILTER (WHERE NOT is_human)                                AS classified_excluded,
  count(*) FILTER (WHERE NOT enrichment_present)                      AS unknown_sessions,
  count(*) FILTER (WHERE NOT is_human AND had_commercial_intent)      AS suspected_false_negatives,
  count(*) FILTER (WHERE is_human AND NOT had_commercial_intent
                        AND enrichment_present)                       AS possible_false_positives,
  ROUND(
    100.0 * (
      count(*) FILTER (WHERE is_human)
      - count(*) FILTER (WHERE is_human AND NOT had_commercial_intent AND enrichment_present)
    )::numeric
    / NULLIF(count(*) FILTER (WHERE is_human), 0)
  , 2)                                                                AS classifier_confidence_pct
FROM base;

GRANT SELECT ON public.real_human_classifier_confidence_7d TO authenticated;

COMMENT ON VIEW public.real_human_funnel_7d IS
  'Real Human Intelligence Constitution — 7d funnel counts over verified real human sessions only.';
COMMENT ON VIEW public.real_human_channel_quality_7d IS
  'Real Human Intelligence Constitution — per-channel human %, real ATC/purchase/revenue metrics.';
COMMENT ON VIEW public.real_human_product_ranking_7d IS
  'Real Human Intelligence Constitution — product ranking on verified real buyers only.';
COMMENT ON VIEW public.real_human_classifier_confidence_7d IS
  'Real Human Intelligence Constitution — classifier self-validation: FP/FN suspects, confidence.';
