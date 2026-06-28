
WITH perf AS (
  SELECT
    d.pin_id,
    d.hook_variant, d.cta_variant, d.niche_key, d.category_key, d.board_id,
    d.published_at,
    SUM(a.impressions)::numeric AS imp,
    SUM(a.saves)::numeric AS saves,
    SUM(a.outbound_clicks + a.pin_clicks)::numeric AS clicks,
    AVG(a.ctr)::numeric AS ctr,
    AVG(EXTRACT(EPOCH FROM (now() - a.day::timestamptz))/86400.0) AS age_days
  FROM public.pinterest_pin_dimensions d
  JOIN public.pinterest_analytics_daily a USING (pin_id)
  WHERE a.day >= (current_date - INTERVAL '60 days')
  GROUP BY 1,2,3,4,5,6,7
),
scored AS (
  SELECT pin_id, hook_variant, cta_variant, niche_key, category_key, board_id, published_at,
    (COALESCE(ctr,0)*0.5 + CASE WHEN imp>0 THEN saves/imp ELSE 0 END * 0.4 + LN(1 + COALESCE(clicks,0)) * 0.1)
      * POWER(0.5, COALESCE(age_days,0)/14.0) AS score,
    age_days
  FROM perf
),
melted AS (
  SELECT pin_id, 'hook_variant'::text AS dim, lower(hook_variant) AS val, score, age_days FROM scored WHERE hook_variant IS NOT NULL
  UNION ALL SELECT pin_id, 'cta_variant', lower(cta_variant), score, age_days FROM scored WHERE cta_variant IS NOT NULL
  UNION ALL SELECT pin_id, 'niche', lower(niche_key), score, age_days FROM scored WHERE niche_key IS NOT NULL
  UNION ALL SELECT pin_id, 'category', lower(category_key), score, age_days FROM scored WHERE category_key IS NOT NULL
  UNION ALL SELECT pin_id, 'board', lower(board_id), score, age_days FROM scored WHERE board_id IS NOT NULL
  UNION ALL SELECT pin_id, 'posting_hour', (EXTRACT(HOUR FROM published_at)::int)::text || 'h', score, age_days FROM scored WHERE published_at IS NOT NULL
  UNION ALL SELECT pin_id, 'weekday', (EXTRACT(DOW FROM published_at)::int)::text, score, age_days FROM scored WHERE published_at IS NOT NULL
),
agg AS (
  SELECT dim, val, COUNT(*) AS n, SUM(score) AS s_total,
    SUM(CASE WHEN age_days<=7 THEN score ELSE 0 END) AS s_recent,
    SUM(CASE WHEN age_days>7  THEN score ELSE 0 END) AS s_older
  FROM melted GROUP BY 1,2
),
baseline AS (SELECT dim, SUM(s_total)/NULLIF(SUM(n),0) AS base FROM agg GROUP BY 1),
sig AS (
  SELECT a.dim, a.val,
    (a.s_total/a.n - b.base)/NULLIF(b.base,0) AS lift,
    (a.s_recent - a.s_older*(7.0/53.0)) AS velocity,
    a.s_total AS momentum,
    LEAST(1, LOG(10, a.n+1)/2.0) AS confidence,
    a.n
  FROM agg a JOIN baseline b USING (dim)
  WHERE a.n >= 3
)
INSERT INTO public.pinterest_taste_signals
  (dimension, value, lift_score, velocity_7d, momentum_30d, confidence, sample_n, expected_lifetime_days, status, computed_at)
SELECT dim, val,
  ROUND(COALESCE(lift,0)::numeric, 4),
  ROUND(COALESCE(velocity,0)::numeric, 4),
  ROUND(COALESCE(momentum,0)::numeric, 4),
  ROUND(COALESCE(confidence,0)::numeric, 3),
  n,
  CASE WHEN lift > 0.15 THEN 45 WHEN lift < -0.15 THEN 7 ELSE 21 END,
  CASE WHEN lift > 0.15 THEN 'rising' WHEN lift < -0.15 THEN 'declining' ELSE 'stable' END,
  now()
FROM sig
ON CONFLICT (dimension, value) DO UPDATE SET
  lift_score=EXCLUDED.lift_score, velocity_7d=EXCLUDED.velocity_7d, momentum_30d=EXCLUDED.momentum_30d,
  confidence=EXCLUDED.confidence, sample_n=EXCLUDED.sample_n,
  expected_lifetime_days=EXCLUDED.expected_lifetime_days, status=EXCLUDED.status, computed_at=EXCLUDED.computed_at;

WITH cs AS (
  SELECT
    CASE
      WHEN d.category_key ILIKE '%cat%furniture%' OR d.niche_key ILIKE '%luxury%' THEN 'luxury_minimal'
      WHEN d.category_key ILIKE '%bed%' OR d.niche_key ILIKE '%cozy%' THEN 'cozy_winter'
      WHEN d.category_key ILIKE '%travel%' OR d.niche_key ILIKE '%outdoor%' THEN 'outdoor_dog_adventure'
      WHEN d.category_key ILIKE '%feeder%' OR d.category_key ILIKE '%kitchen%' THEN 'family_home'
      WHEN d.category_key ILIKE '%litter%' THEN 'modern_cat_parent'
      WHEN d.category_key ILIKE '%toy%' THEN 'pet_wellness'
      ELSE 'premium_interior'
    END AS cluster_key,
    SUM(a.impressions*0.1 + a.saves*4 + (a.outbound_clicks+a.pin_clicks)*2)
      * POWER(0.5, EXTRACT(EPOCH FROM (now()-a.day::timestamptz))/86400.0/14.0) AS w,
    COUNT(*) AS n,
    SUM(CASE WHEN a.day >= current_date - 7 THEN a.saves+a.outbound_clicks+a.pin_clicks ELSE 0 END) AS recent,
    SUM(CASE WHEN a.day <  current_date - 7 THEN a.saves+a.outbound_clicks+a.pin_clicks ELSE 0 END) AS older
  FROM public.pinterest_pin_dimensions d
  JOIN public.pinterest_analytics_daily a USING (pin_id)
  WHERE a.day >= current_date - INTERVAL '60 days'
  GROUP BY 1, a.day
),
roll AS (
  SELECT cluster_key, SUM(w) AS weight, SUM(n) AS sample_n,
    SUM(recent) AS recent, SUM(older) AS older
  FROM cs GROUP BY 1
)
INSERT INTO public.pinterest_taste_clusters
  (cluster_key, label, weight, momentum, sample_n, status, signals, last_seen, computed_at)
SELECT
  cluster_key, initcap(replace(cluster_key,'_',' ')),
  ROUND(weight::numeric, 4),
  ROUND((CASE WHEN older>0 THEN (recent-older)::numeric/older ELSE recent END)::numeric, 4),
  sample_n,
  CASE WHEN older>0 AND (recent-older)::numeric/older > 0.1 THEN 'rising'
       WHEN older>0 AND (recent-older)::numeric/older < -0.1 THEN 'declining'
       ELSE 'stable' END,
  '[]'::jsonb, now(), now()
FROM roll
ON CONFLICT (cluster_key) DO UPDATE SET
  weight=EXCLUDED.weight, momentum=EXCLUDED.momentum, sample_n=EXCLUDED.sample_n,
  status=EXCLUDED.status, last_seen=EXCLUDED.last_seen, computed_at=EXCLUDED.computed_at;

INSERT INTO public.pinterest_evolution_log
  (decision_type, target_dimension, rationale, new_value, metrics)
VALUES (
  'taste_engine_seed', 'account',
  'Initial Taste seed from 60-day Pinterest analytics window.',
  jsonb_build_object(
    'signals_written', (SELECT count(*) FROM public.pinterest_taste_signals),
    'clusters_written', (SELECT count(*) FROM public.pinterest_taste_clusters),
    'rising', (SELECT count(*) FROM public.pinterest_taste_signals WHERE status='rising'),
    'declining', (SELECT count(*) FROM public.pinterest_taste_signals WHERE status='declining'),
    'source', 'sql_seed_v1'
  ),
  jsonb_build_object('window_days', 60)
);
