
-- Genesis V4 CIE: gv4_genome_v
-- Per-trait Winner / Loser genome built from real gcd_performance + gcd_visual_dna joins.
-- No new tables; pure view. Wilson lower bound for confidence weighting.

CREATE OR REPLACE FUNCTION public.gv4_wilson_lower(successes integer, n integer, z numeric DEFAULT 1.96)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN n <= 0 THEN 0::numeric
    ELSE
      ((successes::numeric/n) + (z*z)/(2*n)
       - z*sqrt(((successes::numeric/n)*(1-(successes::numeric/n)) + (z*z)/(4*n))/n)
      ) / (1 + (z*z)/n)
  END
$$;

CREATE OR REPLACE VIEW public.gv4_genome_v AS
WITH perf AS (
  SELECT
    p.creative_id,
    SUM(p.impressions)::int AS impressions,
    SUM(p.outbound_clicks)::int AS clicks,
    SUM(p.saves)::int AS saves,
    SUM(p.purchases)::int AS purchases,
    SUM(p.revenue_usd)::numeric AS revenue,
    AVG(p.success_score)::numeric AS success_score
  FROM public.gcd_performance p
  WHERE p.snapshot_date >= (now() - interval '30 days')::date
  GROUP BY p.creative_id
),
joined AS (
  SELECT
    d.creative_id,
    coalesce(perf.impressions,0) AS impressions,
    coalesce(perf.clicks,0) AS clicks,
    coalesce(perf.saves,0) AS saves,
    coalesce(perf.purchases,0) AS purchases,
    coalesce(perf.revenue,0) AS revenue,
    coalesce(perf.success_score,0) AS success_score,
    CASE WHEN perf.purchases > 0 OR perf.success_score >= 60 THEN 1 ELSE 0 END AS is_winner,
    CASE WHEN perf.impressions >= 200 AND perf.success_score < 30 AND perf.purchases = 0 THEN 1 ELSE 0 END AS is_loser,
    jsonb_build_object(
      'lighting', d.lighting, 'time_of_day', d.time_of_day, 'environment', d.environment,
      'indoor', d.indoor, 'outdoor', d.outdoor, 'composition', d.composition, 'framing', d.framing,
      'breed', d.breed, 'pose', d.pose, 'facial_expression', d.facial_expression,
      'eye_contact', d.eye_contact, 'motion', d.motion, 'story', d.story, 'typography', d.typography,
      'cta', d.cta, 'color_palette', d.color_palette, 'warmth', d.warmth,
      'emotion_primary', d.emotion_primary, 'emotion_secondary', d.emotion_secondary,
      'psychological_trigger', d.psychological_trigger, 'camera', d.camera, 'perspective', d.perspective,
      'season', d.season, 'weather', d.weather
    ) AS traits
  FROM public.gcd_visual_dna d
  LEFT JOIN perf ON perf.creative_id = d.creative_id
),
exploded AS (
  SELECT
    j.is_winner, j.is_loser, j.impressions, j.purchases, j.revenue,
    t.key AS trait_dim,
    t.value #>> '{}' AS trait_value
  FROM joined j
  CROSS JOIN LATERAL jsonb_each(j.traits) t
  WHERE t.value IS NOT NULL AND (t.value #>> '{}') NOT IN ('', 'null')
)
SELECT
  trait_dim,
  trait_value,
  COUNT(*)::int AS sample_n,
  SUM(is_winner)::int AS wins,
  SUM(is_loser)::int AS losses,
  SUM(purchases)::int AS purchases,
  SUM(revenue)::numeric AS revenue,
  SUM(impressions)::bigint AS impressions,
  public.gv4_wilson_lower(SUM(is_winner)::int, COUNT(*)::int) AS winner_wilson,
  public.gv4_wilson_lower(SUM(is_loser)::int, COUNT(*)::int) AS loser_wilson,
  (public.gv4_wilson_lower(SUM(is_winner)::int, COUNT(*)::int)
   - public.gv4_wilson_lower(SUM(is_loser)::int, COUNT(*)::int)) AS net_score
FROM exploded
GROUP BY trait_dim, trait_value
HAVING COUNT(*) >= 5;

GRANT SELECT ON public.gv4_genome_v TO authenticated, service_role;
