
-- 1. Linkage columns on pinterest_video_metrics
ALTER TABLE public.pinterest_video_metrics
  ADD COLUMN IF NOT EXISTS voice_name text,
  ADD COLUMN IF NOT EXISTS scene_slug text,
  ADD COLUMN IF NOT EXISTS board_id text,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_pvm_voice ON public.pinterest_video_metrics(voice_name);
CREATE INDEX IF NOT EXISTS idx_pvm_scene ON public.pinterest_video_metrics(scene_slug);
CREATE INDEX IF NOT EXISTS idx_pvm_board ON public.pinterest_video_metrics(board_id);
CREATE INDEX IF NOT EXISTS idx_pvm_category ON public.pinterest_video_metrics(category);
CREATE INDEX IF NOT EXISTS idx_pvm_day ON public.pinterest_video_metrics(day);

-- 2. Leaderboard views (rolling 30 days)
CREATE OR REPLACE VIEW public.pinterest_leaderboard_voices AS
SELECT
  voice_name,
  COUNT(DISTINCT pin_id)            AS pins,
  SUM(impressions)::bigint          AS impressions,
  SUM(outbound_clicks)::bigint      AS clicks,
  SUM(saves)::bigint                AS saves,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(outbound_clicks)::numeric / SUM(impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(saves)::numeric / SUM(impressions) * 100, 3) ELSE 0 END AS save_rate_pct
FROM public.pinterest_video_metrics
WHERE voice_name IS NOT NULL AND day >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY voice_name
ORDER BY ctr_pct DESC, impressions DESC;

CREATE OR REPLACE VIEW public.pinterest_leaderboard_scenes AS
SELECT
  scene_slug,
  COUNT(DISTINCT pin_id)            AS pins,
  SUM(impressions)::bigint          AS impressions,
  SUM(outbound_clicks)::bigint      AS clicks,
  SUM(saves)::bigint                AS saves,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(outbound_clicks)::numeric / SUM(impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(saves)::numeric / SUM(impressions) * 100, 3) ELSE 0 END AS save_rate_pct
FROM public.pinterest_video_metrics
WHERE scene_slug IS NOT NULL AND day >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY scene_slug
ORDER BY ctr_pct DESC, impressions DESC;

CREATE OR REPLACE VIEW public.pinterest_leaderboard_categories AS
SELECT
  category,
  COUNT(DISTINCT pin_id)            AS pins,
  SUM(impressions)::bigint          AS impressions,
  SUM(outbound_clicks)::bigint      AS clicks,
  SUM(saves)::bigint                AS saves,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(outbound_clicks)::numeric / SUM(impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(saves)::numeric / SUM(impressions) * 100, 3) ELSE 0 END AS save_rate_pct
FROM public.pinterest_video_metrics
WHERE category IS NOT NULL AND day >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY category
ORDER BY ctr_pct DESC, impressions DESC;

CREATE OR REPLACE VIEW public.pinterest_leaderboard_boards AS
SELECT
  m.board_id,
  b.name                            AS board_name,
  COUNT(DISTINCT m.pin_id)          AS pins,
  SUM(m.impressions)::bigint        AS impressions,
  SUM(m.outbound_clicks)::bigint    AS clicks,
  SUM(m.saves)::bigint              AS saves,
  CASE WHEN SUM(m.impressions) > 0 THEN ROUND(SUM(m.outbound_clicks)::numeric / SUM(m.impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  CASE WHEN SUM(m.impressions) > 0 THEN ROUND(SUM(m.saves)::numeric / SUM(m.impressions) * 100, 3) ELSE 0 END AS save_rate_pct
FROM public.pinterest_video_metrics m
LEFT JOIN public.pinterest_boards b ON b.id = m.board_id
WHERE m.board_id IS NOT NULL AND m.day >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY m.board_id, b.name
ORDER BY ctr_pct DESC, impressions DESC;

GRANT SELECT ON public.pinterest_leaderboard_voices    TO authenticated, service_role;
GRANT SELECT ON public.pinterest_leaderboard_scenes    TO authenticated, service_role;
GRANT SELECT ON public.pinterest_leaderboard_categories TO authenticated, service_role;
GRANT SELECT ON public.pinterest_leaderboard_boards    TO authenticated, service_role;

-- 3. Auto-weight updater (clamps 0.2..2.5 relative to baseline)
CREATE OR REPLACE FUNCTION public.apply_pinterest_perf_weights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baseline_ctr numeric;
  v_scene_baseline numeric;
  v_voices_updated int := 0;
  v_scenes_updated int := 0;
BEGIN
  -- Voices: rebalance weight = baseline * clamp(ctr / median_ctr, 0.2, 2.5)
  SELECT NULLIF(percentile_cont(0.5) WITHIN GROUP (ORDER BY ctr_pct), 0)
    INTO v_baseline_ctr
  FROM public.pinterest_leaderboard_voices
  WHERE impressions >= 200;

  IF v_baseline_ctr IS NOT NULL THEN
    UPDATE public.cinematic_voice_profiles vp
    SET weight = GREATEST(0.05, LEAST(0.50,
        0.20 * GREATEST(0.2, LEAST(2.5, lb.ctr_pct / v_baseline_ctr))
      ))
    FROM public.pinterest_leaderboard_voices lb
    WHERE lb.voice_name = vp.label
      AND lb.impressions >= 200
      AND vp.active = true;
    GET DIAGNOSTICS v_voices_updated = ROW_COUNT;
  END IF;

  -- Scenes: same logic, clamp 0.2..2.5 around neutral 1.0
  SELECT NULLIF(percentile_cont(0.5) WITHIN GROUP (ORDER BY ctr_pct), 0)
    INTO v_scene_baseline
  FROM public.pinterest_leaderboard_scenes
  WHERE impressions >= 200;

  IF v_scene_baseline IS NOT NULL THEN
    UPDATE public.cinematic_scene_environments se
    SET weight = GREATEST(0.2, LEAST(2.5, lb.ctr_pct / v_scene_baseline))
    FROM public.pinterest_leaderboard_scenes lb
    WHERE lb.scene_slug = se.slug
      AND lb.impressions >= 200
      AND se.active = true;
    GET DIAGNOSTICS v_scenes_updated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'voices_updated', v_voices_updated,
    'scenes_updated', v_scenes_updated,
    'voice_baseline_ctr', v_baseline_ctr,
    'scene_baseline_ctr', v_scene_baseline,
    'run_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pinterest_perf_weights() FROM public;
GRANT EXECUTE ON FUNCTION public.apply_pinterest_perf_weights() TO service_role;
