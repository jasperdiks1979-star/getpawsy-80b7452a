ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS is_misclick boolean,
  ADD COLUMN IF NOT EXISTS is_repeat_click boolean,
  ADD COLUMN IF NOT EXISTS repeat_index integer,
  ADD COLUMN IF NOT EXISTS previous_placement text,
  ADD COLUMN IF NOT EXISTS delta_ms integer;

DROP FUNCTION IF EXISTS public.get_placement_overview(integer, boolean, text);

CREATE FUNCTION public.get_placement_overview(
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
  first_click_wins bigint,
  misclicks bigint,
  repeat_clicks bigint,
  misclick_rate_pct numeric,
  repeat_click_rate_pct numeric,
  intent_clicks bigint,
  intent_ctr_pct numeric
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
    SELECT placement,
           COUNT(*) AS clicks,
           SUM(CASE WHEN is_misclick THEN 1 ELSE 0 END) AS misclicks,
           SUM(CASE WHEN is_repeat_click THEN 1 ELSE 0 END) AS repeats,
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
    COALESCE(clk.first_wins, 0) AS first_click_wins,
    COALESCE(clk.misclicks, 0) AS misclicks,
    COALESCE(clk.repeats, 0) AS repeat_clicks,
    CASE WHEN COALESCE(clk.clicks, 0) > 0
      THEN ROUND((COALESCE(clk.misclicks, 0)::numeric / clk.clicks) * 100, 2)
      ELSE 0
    END AS misclick_rate_pct,
    CASE WHEN COALESCE(clk.clicks, 0) > 0
      THEN ROUND((COALESCE(clk.repeats, 0)::numeric / clk.clicks) * 100, 2)
      ELSE 0
    END AS repeat_click_rate_pct,
    GREATEST(
      COALESCE(clk.clicks, 0) - COALESCE(clk.misclicks, 0) - COALESCE(clk.repeats, 0),
      0
    ) AS intent_clicks,
    CASE WHEN COALESCE(imp.impressions, 0) > 0
      THEN ROUND(
        (GREATEST(
          COALESCE(clk.clicks, 0) - COALESCE(clk.misclicks, 0) - COALESCE(clk.repeats, 0),
          0
        )::numeric / imp.impressions) * 100,
        2
      )
      ELSE 0
    END AS intent_ctr_pct
  FROM all_placements ap
  LEFT JOIN imp ON imp.placement = ap.placement
  LEFT JOIN clk ON clk.placement = ap.placement
  ORDER BY intent_ctr_pct DESC, impressions DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_placement_overview(integer, boolean, text) TO anon, authenticated;