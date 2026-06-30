
CREATE OR REPLACE VIEW public.gv42_recommendation_v AS
WITH q AS (
  SELECT id AS queue_id, product_id, product_slug, product_name, pin_title, pin_description,
         pin_image_url, board_id, board_name, category_key, status, priority, created_at,
         us_audience_score, image_match_score, verification_score, pcie2_creative_id, meta
  FROM public.pinterest_pin_queue
  WHERE status IN ('queued','draft','approved','pending')
),
perf AS (
  SELECT p.product_id::uuid AS product_id,
         COUNT(*)                            AS perf_n,
         COALESCE(SUM(p.impressions),0)      AS impressions_sum,
         COALESCE(SUM(p.clicks),0)           AS clicks_sum,
         COALESCE(SUM(p.saves),0)            AS saves_sum,
         AVG(NULLIF(p.ctr,0))                AS ctr_avg,
         AVG(NULLIF(p.performance_score,0))  AS perf_score_avg
  FROM public.pinterest_pin_performance p
  WHERE p.created_at > now() - interval '30 days' AND p.product_id ~ '^[0-9a-f-]{36}$'
  GROUP BY 1
),
recent_repeats AS (
  SELECT lower(coalesce(meta->>'headline_family','')) AS hk, count(*) AS n
  FROM public.pinterest_pin_queue
  WHERE status IN ('posted','queued','approved') AND created_at > now() - interval '14 days'
  GROUP BY 1
)
SELECT
  q.queue_id, q.product_id, q.product_slug, q.product_name, q.pin_title,
  q.pin_image_url, q.board_id, q.board_name, q.category_key, q.status, q.priority, q.created_at,
  COALESCE(q.us_audience_score,0)::numeric    AS us_audience_score,
  COALESCE(q.image_match_score,0)::numeric    AS image_match_score,
  COALESCE(q.verification_score,0)::numeric   AS verification_score,
  c.id AS creative_id, c.headline, c.hook, c.cta, c.visual_style, c.lighting, c.camera_angle,
  c.primary_emotion, c.story_type, c.animal_breed,
  COALESCE(c.product_visibility_score,0)::numeric AS product_visibility_score,
  COALESCE(c.safe_zone_score,0)::numeric          AS safe_zone_score,
  c.scores AS creative_scores, c.image_hash, c.perceptual_hash,
  COALESCE(perf.perf_n,0)::int          AS perf_n,
  COALESCE(perf.impressions_sum,0)::bigint AS impressions_sum,
  COALESCE(perf.clicks_sum,0)::bigint   AS clicks_sum,
  COALESCE(perf.saves_sum,0)::bigint    AS saves_sum,
  COALESCE(perf.ctr_avg,0)::numeric     AS ctr_avg,
  COALESCE(perf.perf_score_avg,0)::numeric AS perf_score_avg,
  COALESCE(rr.n,0)::int                 AS recent_family_repeats
FROM q
LEFT JOIN public.pcie2_creatives c ON c.id = q.pcie2_creative_id
LEFT JOIN perf ON perf.product_id = q.product_id
LEFT JOIN recent_repeats rr ON rr.hk = lower(coalesce(c.headline,''));

GRANT SELECT ON public.gv42_recommendation_v TO authenticated, service_role;
