-- Failure analytics: aggregate render rejection causes
CREATE OR REPLACE VIEW public.pinterest_failure_analytics_v
WITH (security_invoker = true) AS
WITH attempts AS (
  SELECT
    id,
    pin_queue_id,
    niche_key,
    hook_category,
    pattern_id,
    attempt_no,
    rejected,
    reasons,
    total_score,
    created_at
  FROM public.pinterest_render_attempts
  WHERE created_at > now() - interval '14 days'
)
SELECT
  COALESCE(reason, '_no_reason') AS reason,
  COALESCE(hook_category, '_unknown') AS hook_category,
  COALESCE(pattern_id, '_unknown') AS pattern_id,
  COALESCE(niche_key, '_unknown') AS niche_key,
  COUNT(*) FILTER (WHERE rejected)::int AS rejected_count,
  COUNT(*)::int AS total_count,
  ROUND(AVG(total_score)::numeric, 2) AS avg_score
FROM attempts
LEFT JOIN LATERAL unnest(
  CASE WHEN array_length(reasons,1) IS NULL THEN ARRAY[NULL]::text[] ELSE reasons END
) AS reason ON true
GROUP BY 1, 2, 3, 4;

-- Retry outcomes: first vs last attempt per pin
CREATE OR REPLACE VIEW public.pinterest_retry_outcomes_v
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    pin_queue_id,
    niche_key,
    hook_category,
    pattern_id,
    attempt_no,
    rejected,
    total_score,
    reasons,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY pin_queue_id ORDER BY attempt_no ASC) AS first_rn,
    ROW_NUMBER() OVER (PARTITION BY pin_queue_id ORDER BY attempt_no DESC) AS last_rn,
    COUNT(*) OVER (PARTITION BY pin_queue_id) AS attempts_total
  FROM public.pinterest_render_attempts
  WHERE created_at > now() - interval '30 days' AND pin_queue_id IS NOT NULL
)
SELECT
  pin_queue_id,
  MAX(niche_key) AS niche_key,
  MAX(hook_category) AS hook_category,
  MAX(pattern_id) AS pattern_id,
  MAX(attempts_total)::int AS attempts_total,
  MAX(total_score) FILTER (WHERE first_rn = 1) AS first_score,
  MAX(total_score) FILTER (WHERE last_rn = 1) AS final_score,
  (MAX(total_score) FILTER (WHERE last_rn = 1) - MAX(total_score) FILTER (WHERE first_rn = 1)) AS score_delta,
  bool_and(rejected) AS all_rejected,
  bool_or(NOT rejected) AS any_accepted
FROM ranked
GROUP BY pin_queue_id;

-- Score distribution into bands
CREATE OR REPLACE VIEW public.pinterest_score_distribution_v
WITH (security_invoker = true) AS
SELECT
  CASE
    WHEN total_score >= 88 THEN 'elite'
    WHEN total_score >= 78 THEN 'strong'
    WHEN total_score >= 70 THEN 'acceptable'
    WHEN total_score >= 58 THEN 'weak'
    ELSE 'reject'
  END AS band,
  COALESCE(niche_key, '_unknown') AS niche_key,
  COALESCE(hook_category, '_unknown') AS hook_category,
  COUNT(*)::int AS attempts,
  ROUND(AVG(total_score)::numeric, 2) AS avg_score,
  COUNT(*) FILTER (WHERE rejected)::int AS rejected_count
FROM public.pinterest_render_attempts
WHERE created_at > now() - interval '14 days' AND total_score IS NOT NULL
GROUP BY 1, 2, 3;

-- Winner leaderboards: by hook, pattern, niche, cta
CREATE OR REPLACE VIEW public.pinterest_winner_leaderboard_v
WITH (security_invoker = true) AS
SELECT
  w.pin_queue_id,
  w.pattern_id,
  w.hook_category,
  w.cta_phrase,
  w.niche_key,
  w.pinterest_impressions,
  w.pinterest_saves,
  w.pinterest_outbound_clicks,
  w.ga4_sessions,
  w.ga4_engaged_sessions,
  w.profit_verdict,
  w.composite_score,
  CASE WHEN w.pinterest_impressions > 0
    THEN ROUND((w.pinterest_outbound_clicks::numeric / w.pinterest_impressions) * 100, 2)
    ELSE NULL END AS ctr_pct,
  CASE WHEN w.pinterest_impressions > 0
    THEN ROUND((w.pinterest_saves::numeric / w.pinterest_impressions) * 100, 2)
    ELSE NULL END AS save_rate_pct,
  CASE WHEN w.ga4_sessions > 0
    THEN ROUND((w.ga4_engaged_sessions::numeric / w.ga4_sessions) * 100, 2)
    ELSE NULL END AS engagement_pct,
  q.product_slug,
  q.product_name,
  q.pin_image_url,
  q.board_name,
  q.posted_at
FROM public.pinterest_creative_winners w
LEFT JOIN public.pinterest_pin_queue q ON q.id = w.pin_queue_id;

GRANT SELECT ON public.pinterest_failure_analytics_v TO authenticated;
GRANT SELECT ON public.pinterest_retry_outcomes_v TO authenticated;
GRANT SELECT ON public.pinterest_score_distribution_v TO authenticated;
GRANT SELECT ON public.pinterest_winner_leaderboard_v TO authenticated;