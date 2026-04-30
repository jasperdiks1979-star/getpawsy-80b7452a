ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS cohort text;

CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_cohort_event_created
  ON public.lp_funnel_events (cohort, event_name, created_at DESC);

-- Replace the overview RPC to accept an optional cohort filter
-- ('first_session' | 'returning' | NULL = both).
CREATE OR REPLACE FUNCTION public.get_placement_overview(
  p_days integer DEFAULT 14,
  p_include_internal boolean DEFAULT false,
  p_cohort text DEFAULT NULL
)
RETURNS TABLE (
  placement text,
  impressions bigint,
  clicks bigint,
  ctr_pct numeric,
  median_time_to_visible_ms numeric,
  p90_time_to_visible_ms numeric,
  median_time_to_click_ms numeric,
  p90_time_to_click_ms numeric,
  median_dwell_ms numeric,
  first_click_wins bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_events AS (
    SELECT *
    FROM public.lp_funnel_events
    WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND (p_include_internal OR is_internal IS NOT TRUE)
      AND placement IS NOT NULL
      AND (p_cohort IS NULL OR cohort = p_cohort)
  ),
  imp AS (
    SELECT placement, COUNT(*) AS impressions,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_visible_ms) AS p50_ttv,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY time_to_visible_ms) AS p90_ttv
    FROM window_events
    WHERE event_name = 'lp_cta_impression'
    GROUP BY placement
  ),
  clk AS (
    SELECT placement, COUNT(*) AS clicks,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_click_ms) AS p50_ttc,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY time_to_click_ms) AS p90_ttc,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY dwell_ms) AS p50_dwell,
           SUM(CASE WHEN is_first_click THEN 1 ELSE 0 END) AS first_wins
    FROM window_events
    WHERE event_name = 'lp_cta_click'
    GROUP BY placement
  ),
  all_placements AS (
    SELECT placement FROM imp
    UNION
    SELECT placement FROM clk
  )
  SELECT
    ap.placement,
    COALESCE(imp.impressions, 0) AS impressions,
    COALESCE(clk.clicks, 0) AS clicks,
    CASE WHEN COALESCE(imp.impressions, 0) > 0
      THEN ROUND((COALESCE(clk.clicks, 0)::numeric / imp.impressions) * 100, 2)
      ELSE 0
    END AS ctr_pct,
    ROUND(imp.p50_ttv::numeric, 0) AS median_time_to_visible_ms,
    ROUND(imp.p90_ttv::numeric, 0) AS p90_time_to_visible_ms,
    ROUND(clk.p50_ttc::numeric, 0) AS median_time_to_click_ms,
    ROUND(clk.p90_ttc::numeric, 0) AS p90_time_to_click_ms,
    ROUND(clk.p50_dwell::numeric, 0) AS median_dwell_ms,
    COALESCE(clk.first_wins, 0) AS first_click_wins
  FROM all_placements ap
  LEFT JOIN imp ON imp.placement = ap.placement
  LEFT JOIN clk ON clk.placement = ap.placement
  ORDER BY ctr_pct DESC, impressions DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_placement_overview(integer, boolean, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_placement_overview_trend(
  p_days integer DEFAULT 14,
  p_include_internal boolean DEFAULT false,
  p_cohort text DEFAULT NULL
)
RETURNS TABLE (
  day date,
  placement text,
  impressions bigint,
  clicks bigint,
  ctr_pct numeric,
  median_time_to_visible_ms numeric,
  median_time_to_click_ms numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_events AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
           placement, event_name, time_to_visible_ms, time_to_click_ms
    FROM public.lp_funnel_events
    WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND (p_include_internal OR is_internal IS NOT TRUE)
      AND placement IS NOT NULL
      AND (p_cohort IS NULL OR cohort = p_cohort)
  ),
  agg AS (
    SELECT day, placement,
           SUM(CASE WHEN event_name = 'lp_cta_impression' THEN 1 ELSE 0 END) AS impressions,
           SUM(CASE WHEN event_name = 'lp_cta_click' THEN 1 ELSE 0 END) AS clicks,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY CASE WHEN event_name = 'lp_cta_impression' THEN time_to_visible_ms END
           ) AS p50_ttv,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY CASE WHEN event_name = 'lp_cta_click' THEN time_to_click_ms END
           ) AS p50_ttc
    FROM window_events
    GROUP BY day, placement
  )
  SELECT
    day,
    placement,
    impressions,
    clicks,
    CASE WHEN impressions > 0
      THEN ROUND((clicks::numeric / impressions) * 100, 2)
      ELSE 0
    END AS ctr_pct,
    ROUND(p50_ttv::numeric, 0) AS median_time_to_visible_ms,
    ROUND(p50_ttc::numeric, 0) AS median_time_to_click_ms
  FROM agg
  ORDER BY day ASC, placement ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_placement_overview_trend(integer, boolean, text) TO anon, authenticated;

-- Cohort-vs-cohort comparison RPC — one row per (placement, cohort) so the
-- dashboard can render a side-by-side first_session vs returning view.
CREATE OR REPLACE FUNCTION public.get_placement_overview_by_cohort(
  p_days integer DEFAULT 14,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  placement text,
  cohort text,
  impressions bigint,
  clicks bigint,
  ctr_pct numeric,
  median_time_to_visible_ms numeric,
  median_time_to_click_ms numeric,
  first_click_wins bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_events AS (
    SELECT *
    FROM public.lp_funnel_events
    WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND (p_include_internal OR is_internal IS NOT TRUE)
      AND placement IS NOT NULL
      AND cohort IS NOT NULL
  ),
  imp AS (
    SELECT placement, cohort, COUNT(*) AS impressions,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_visible_ms) AS p50_ttv
    FROM window_events
    WHERE event_name = 'lp_cta_impression'
    GROUP BY placement, cohort
  ),
  clk AS (
    SELECT placement, cohort, COUNT(*) AS clicks,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_click_ms) AS p50_ttc,
           SUM(CASE WHEN is_first_click THEN 1 ELSE 0 END) AS first_wins
    FROM window_events
    WHERE event_name = 'lp_cta_click'
    GROUP BY placement, cohort
  ),
  pairs AS (
    SELECT placement, cohort FROM imp
    UNION
    SELECT placement, cohort FROM clk
  )
  SELECT
    p.placement,
    p.cohort,
    COALESCE(imp.impressions, 0) AS impressions,
    COALESCE(clk.clicks, 0) AS clicks,
    CASE WHEN COALESCE(imp.impressions, 0) > 0
      THEN ROUND((COALESCE(clk.clicks, 0)::numeric / imp.impressions) * 100, 2)
      ELSE 0
    END AS ctr_pct,
    ROUND(imp.p50_ttv::numeric, 0) AS median_time_to_visible_ms,
    ROUND(clk.p50_ttc::numeric, 0) AS median_time_to_click_ms,
    COALESCE(clk.first_wins, 0) AS first_click_wins
  FROM pairs p
  LEFT JOIN imp ON imp.placement = p.placement AND imp.cohort = p.cohort
  LEFT JOIN clk ON clk.placement = p.placement AND clk.cohort = p.cohort
  ORDER BY p.placement, p.cohort;
$$;

GRANT EXECUTE ON FUNCTION public.get_placement_overview_by_cohort(integer, boolean) TO anon, authenticated;