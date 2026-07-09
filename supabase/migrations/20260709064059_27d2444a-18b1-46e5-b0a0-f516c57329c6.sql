
-- Additive read-only monitoring views over PCIE2 published pins.
-- No base tables changed. Views inherit RLS from base tables (SECURITY INVOKER default).

CREATE OR REPLACE VIEW public.v_pcie2_pin_distribution AS
WITH published AS (
  SELECT
    q.id                AS queue_id,
    q.pinterest_pin_id  AS pin_id,
    q.product_id,
    q.product_slug,
    q.board_id,
    q.headline,
    q.published_at,
    q.image_url,
    EXTRACT(EPOCH FROM (now() - q.published_at)) / 3600.0 AS age_hours
  FROM public.pcie2_publish_queue q
  WHERE q.status = 'published'
    AND q.pinterest_pin_id IS NOT NULL
    AND q.published_at IS NOT NULL
),
perf_latest AS (
  SELECT DISTINCT ON (pin_id)
    pin_id, impressions, saves, outbound_clicks, closeups, ctr, engagement_rate, category, measured_at
  FROM public.pcie2_pin_performance
  ORDER BY pin_id, measured_at DESC
),
daily AS (
  SELECT
    pin_id,
    SUM(impressions)     FILTER (WHERE day >= (now() - interval '1 day')::date)  AS impressions_24h,
    SUM(impressions)     FILTER (WHERE day >= (now() - interval '3 day')::date)  AS impressions_72h,
    SUM(impressions)     FILTER (WHERE day >= (now() - interval '7 day')::date)  AS impressions_7d,
    SUM(saves)           FILTER (WHERE day >= (now() - interval '1 day')::date)  AS saves_24h,
    SUM(saves)           FILTER (WHERE day >= (now() - interval '7 day')::date)  AS saves_7d,
    SUM(outbound_clicks) FILTER (WHERE day >= (now() - interval '1 day')::date)  AS outbound_24h,
    SUM(outbound_clicks) FILTER (WHERE day >= (now() - interval '7 day')::date)  AS outbound_7d,
    SUM(pin_clicks)      FILTER (WHERE day >= (now() - interval '7 day')::date)  AS pin_clicks_7d
  FROM public.pinterest_analytics_daily
  GROUP BY pin_id
),
account_avg AS (
  SELECT
    COALESCE(NULLIF(SUM(outbound_clicks)::numeric,0) / NULLIF(SUM(impressions),0), 0) AS acct_ctr,
    COALESCE(NULLIF(SUM(saves)::numeric,0)          / NULLIF(SUM(impressions),0), 0) AS acct_save_rate
  FROM public.pinterest_analytics_daily
  WHERE day >= (now() - interval '30 day')::date
)
SELECT
  p.queue_id,
  p.pin_id,
  p.product_id,
  p.product_slug,
  pr.name        AS product_name,
  pr.category    AS product_category,
  p.board_id,
  b.name         AS board_name,
  COALESCE(perf_latest.category, pr.category) AS category,
  p.headline,
  p.image_url,
  p.published_at,
  ROUND(p.age_hours::numeric, 2) AS age_hours,

  COALESCE(perf_latest.impressions, 0)     AS impressions_total,
  COALESCE(perf_latest.saves, 0)           AS saves_total,
  COALESCE(perf_latest.outbound_clicks, 0) AS outbound_total,
  COALESCE(perf_latest.closeups, 0)        AS pin_clicks_total,
  COALESCE(perf_latest.ctr, 0)             AS ctr_latest,

  COALESCE(d.impressions_24h, 0) AS impressions_24h,
  COALESCE(d.impressions_72h, 0) AS impressions_72h,
  COALESCE(d.impressions_7d,  0) AS impressions_7d,
  COALESCE(d.saves_24h,       0) AS saves_24h,
  COALESCE(d.saves_7d,        0) AS saves_7d,
  COALESCE(d.outbound_24h,    0) AS outbound_24h,
  COALESCE(d.outbound_7d,     0) AS outbound_7d,
  COALESCE(d.pin_clicks_7d,   0) AS pin_clicks_7d,

  CASE WHEN COALESCE(d.impressions_7d,0) > 0
       THEN ROUND((COALESCE(d.outbound_7d,0)::numeric / d.impressions_7d) * 100, 3)
       ELSE 0 END AS ctr_7d_pct,
  CASE WHEN COALESCE(d.impressions_7d,0) > 0
       THEN ROUND((COALESCE(d.saves_7d,0)::numeric / d.impressions_7d) * 100, 3)
       ELSE 0 END AS save_rate_7d_pct,

  -- Velocities (per hour, over last 24h window)
  ROUND(COALESCE(d.impressions_24h,0)::numeric / 24, 3) AS impression_velocity_hr,
  ROUND(COALESCE(d.saves_24h,0)::numeric       / 24, 3) AS save_velocity_hr,
  ROUND(COALESCE(d.outbound_24h,0)::numeric    / 24, 3) AS click_velocity_hr,

  -- Engagement score 0..100
  LEAST(100, GREATEST(0, ROUND(
    ( CASE WHEN COALESCE(d.impressions_7d,0)>0
           THEN LEAST(1, (COALESCE(d.outbound_7d,0)::numeric / d.impressions_7d) / GREATEST(0.005, aa.acct_ctr)) * 0.30
           ELSE 0 END
    + CASE WHEN COALESCE(d.impressions_7d,0)>0
           THEN LEAST(1, (COALESCE(d.saves_7d,0)::numeric / d.impressions_7d) / GREATEST(0.005, aa.acct_save_rate)) * 0.35
           ELSE 0 END
    + LEAST(1, COALESCE(d.impressions_7d,0)::numeric / 1000.0) * 0.35
    ) * 100
  ,1))) AS engagement_score,

  CASE
    WHEN p.age_hours < 6                                                 THEN 'NEW'
    WHEN p.age_hours BETWEEN 6 AND 24 AND COALESCE(d.impressions_24h,0)=0 THEN 'INDEXING'
    WHEN p.age_hours > 72 AND COALESCE(d.impressions_72h,0)=0            THEN 'DORMANT'
    WHEN p.age_hours > 24 AND COALESCE(d.impressions_24h,0) < 10         THEN 'STALLED'
    WHEN COALESCE(d.impressions_7d,0) > 1000
         AND COALESCE(d.impressions_7d,0) > 0
         AND (COALESCE(d.outbound_7d,0)::numeric / d.impressions_7d) >= 1.5 * GREATEST(0.005, aa.acct_ctr)
         AND (COALESCE(d.saves_7d,0)::numeric    / d.impressions_7d) >= 1.5 * GREATEST(0.005, aa.acct_save_rate)
         THEN 'VIRAL'
    WHEN COALESCE(d.impressions_24h,0) > (COALESCE(d.impressions_7d,0)::numeric / 7.0) * 1.2
         AND COALESCE(d.impressions_24h,0) >= 20
         THEN 'GROWING'
    WHEN COALESCE(d.impressions_24h,0) >= 10 THEN 'DISTRIBUTING'
    ELSE 'STALLED'
  END AS distribution_status,

  ARRAY_REMOVE(ARRAY[
    CASE WHEN p.age_hours >= 24 AND COALESCE(d.impressions_24h,0)=0 THEN 'zero_imps_24h' END,
    CASE WHEN p.age_hours >= 72 AND COALESCE(d.impressions_72h,0)=0 THEN 'zero_imps_72h' END,
    CASE WHEN COALESCE(d.impressions_7d,0) > 100
              AND (COALESCE(d.outbound_7d,0)::numeric / d.impressions_7d) < 0.5 * GREATEST(0.005, aa.acct_ctr)
         THEN 'ctr_below_avg' END,
    CASE WHEN COALESCE(d.impressions_24h,0) > (COALESCE(d.impressions_7d,0)::numeric / 7.0) * 1.5
              AND COALESCE(d.impressions_24h,0) >= 50
         THEN 'imps_accelerating' END,
    CASE WHEN COALESCE(d.saves_24h,0) > (COALESCE(d.saves_7d,0)::numeric / 7.0) * 1.5
              AND COALESCE(d.saves_24h,0) >= 5
         THEN 'saves_accelerating' END
  ], NULL) AS flags,

  aa.acct_ctr       AS account_avg_ctr,
  aa.acct_save_rate AS account_avg_save_rate
FROM published p
LEFT JOIN perf_latest      ON perf_latest.pin_id = p.pin_id
LEFT JOIN daily d          ON d.pin_id = p.pin_id
LEFT JOIN public.pinterest_boards b ON b.id = p.board_id
LEFT JOIN public.products pr        ON pr.id = p.product_id
CROSS JOIN account_avg aa;

GRANT SELECT ON public.v_pcie2_pin_distribution TO authenticated;

-- Board rollup
CREATE OR REPLACE VIEW public.v_pcie2_distribution_board_rollup AS
SELECT
  board_id,
  MAX(board_name) AS board_name,
  COUNT(*)                                                         AS pins,
  SUM(impressions_7d)                                              AS impressions_7d,
  SUM(saves_7d)                                                    AS saves_7d,
  SUM(outbound_7d)                                                 AS outbound_7d,
  ROUND(AVG(NULLIF(ctr_7d_pct,0)), 3)                              AS avg_ctr_7d_pct,
  ROUND(AVG(engagement_score), 1)                                  AS avg_engagement_score,
  COUNT(*) FILTER (WHERE distribution_status IN ('STALLED','DORMANT')) AS underperforming_pins,
  COUNT(*) FILTER (WHERE distribution_status IN ('GROWING','VIRAL'))   AS winning_pins
FROM public.v_pcie2_pin_distribution
GROUP BY board_id;

GRANT SELECT ON public.v_pcie2_distribution_board_rollup TO authenticated;

-- Product rollup
CREATE OR REPLACE VIEW public.v_pcie2_distribution_product_rollup AS
SELECT
  product_id,
  MAX(product_name) AS product_name,
  MAX(product_slug) AS product_slug,
  COUNT(*)                                                         AS pins,
  SUM(impressions_7d)                                              AS impressions_7d,
  SUM(saves_7d)                                                    AS saves_7d,
  SUM(outbound_7d)                                                 AS outbound_7d,
  ROUND(AVG(NULLIF(ctr_7d_pct,0)), 3)                              AS avg_ctr_7d_pct,
  ROUND(AVG(engagement_score), 1)                                  AS avg_engagement_score,
  COUNT(*) FILTER (WHERE distribution_status IN ('STALLED','DORMANT')) AS underperforming_pins,
  COUNT(*) FILTER (WHERE distribution_status IN ('GROWING','VIRAL'))   AS winning_pins
FROM public.v_pcie2_pin_distribution
GROUP BY product_id;

GRANT SELECT ON public.v_pcie2_distribution_product_rollup TO authenticated;

-- Category rollup
CREATE OR REPLACE VIEW public.v_pcie2_distribution_category_rollup AS
SELECT
  COALESCE(category, 'uncategorized') AS category,
  COUNT(*)                                                         AS pins,
  SUM(impressions_7d)                                              AS impressions_7d,
  SUM(saves_7d)                                                    AS saves_7d,
  SUM(outbound_7d)                                                 AS outbound_7d,
  ROUND(AVG(NULLIF(ctr_7d_pct,0)), 3)                              AS avg_ctr_7d_pct,
  ROUND(AVG(engagement_score), 1)                                  AS avg_engagement_score,
  COUNT(*) FILTER (WHERE distribution_status IN ('STALLED','DORMANT')) AS underperforming_pins,
  COUNT(*) FILTER (WHERE distribution_status IN ('GROWING','VIRAL'))   AS winning_pins
FROM public.v_pcie2_pin_distribution
GROUP BY COALESCE(category, 'uncategorized');

GRANT SELECT ON public.v_pcie2_distribution_category_rollup TO authenticated;

-- Enterprise health score (single row)
CREATE OR REPLACE VIEW public.v_pcie2_distribution_health AS
WITH base AS (
  SELECT * FROM public.v_pcie2_pin_distribution
),
mature AS (SELECT * FROM base WHERE age_hours >= 24),
totals AS (
  SELECT
    COUNT(*)                                                         AS pins_total,
    COUNT(*) FILTER (WHERE distribution_status = 'NEW')              AS pins_new,
    COUNT(*) FILTER (WHERE distribution_status = 'INDEXING')         AS pins_indexing,
    COUNT(*) FILTER (WHERE distribution_status = 'DISTRIBUTING')     AS pins_distributing,
    COUNT(*) FILTER (WHERE distribution_status = 'GROWING')          AS pins_growing,
    COUNT(*) FILTER (WHERE distribution_status = 'VIRAL')            AS pins_viral,
    COUNT(*) FILTER (WHERE distribution_status = 'STALLED')          AS pins_stalled,
    COUNT(*) FILTER (WHERE distribution_status = 'DORMANT')          AS pins_dormant
  FROM base
),
mature_stats AS (
  SELECT
    COUNT(*)                                             AS mature_pins,
    COUNT(*) FILTER (WHERE impressions_24h > 0)          AS mature_with_imps,
    AVG(ctr_7d_pct)                                      AS median_ctr_pct,
    MAX(account_avg_ctr) * 100                           AS acct_ctr_pct
  FROM mature
),
cadence AS (
  SELECT COUNT(*) FILTER (WHERE published_at >= now() - interval '7 day') AS published_7d
  FROM base
)
SELECT
  t.*,
  ms.mature_pins,
  ms.mature_with_imps,
  ROUND(ms.median_ctr_pct, 3) AS median_ctr_7d_pct,
  ROUND(ms.acct_ctr_pct, 3)   AS account_avg_ctr_pct,
  c.published_7d,
  ROUND(LEAST(100, GREATEST(0,
      -- pins reaching impressions in first 24h (0.30)
      COALESCE(ms.mature_with_imps::numeric / NULLIF(ms.mature_pins,0), 0) * 30
      -- CTR vs account avg (0.20)
    + LEAST(1, COALESCE(ms.median_ctr_pct,0) / GREATEST(0.5, ms.acct_ctr_pct)) * 20
      -- share distributing/growing/viral (0.25)
    + COALESCE((t.pins_distributing + t.pins_growing + t.pins_viral)::numeric / NULLIF(t.pins_total,0), 0) * 25
      -- penalty for dormant/stalled (0.15)
    + (1 - COALESCE((t.pins_stalled + t.pins_dormant)::numeric / NULLIF(t.pins_total,0), 0)) * 15
      -- cadence: any publishing in last 7d (0.10)
    + CASE WHEN c.published_7d > 0 THEN 10 ELSE 0 END
  )), 1) AS enterprise_health_score
FROM totals t
CROSS JOIN mature_stats ms
CROSS JOIN cadence c;

GRANT SELECT ON public.v_pcie2_distribution_health TO authenticated;
