-- 1. Extend lp_funnel_events with per-placement timing + first-click attribution columns.
ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS time_to_visible_ms integer,
  ADD COLUMN IF NOT EXISTS time_to_click_ms integer,
  ADD COLUMN IF NOT EXISTS dwell_ms integer,
  ADD COLUMN IF NOT EXISTS scroll_depth_at_visible integer,
  ADD COLUMN IF NOT EXISTS scroll_depth_at_click integer,
  ADD COLUMN IF NOT EXISTS is_first_click boolean,
  ADD COLUMN IF NOT EXISTS first_click_placement text;

CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_placement_event_created
  ON public.lp_funnel_events (placement, event_name, created_at DESC);

-- 2. Per-placement overview RPC. Returns one row per placement with CTR,
--    median time-to-visible, median time-to-click, total impressions/clicks,
--    and the count of first-click wins. Excludes internal traffic by default.
CREATE OR REPLACE FUNCTION public.get_placement_overview(
  p_days integer DEFAULT 14,
  p_include_internal boolean DEFAULT false
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

GRANT EXECUTE ON FUNCTION public.get_placement_overview(integer, boolean) TO anon, authenticated;

-- 3. Daily trend RPC — one row per (day, placement) so the dashboard can
--    chart impressions, clicks, and CTR over time.
CREATE OR REPLACE FUNCTION public.get_placement_overview_trend(
  p_days integer DEFAULT 14,
  p_include_internal boolean DEFAULT false
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

GRANT EXECUTE ON FUNCTION public.get_placement_overview_trend(integer, boolean) TO anon, authenticated;