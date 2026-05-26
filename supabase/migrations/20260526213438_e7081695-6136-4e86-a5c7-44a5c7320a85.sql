
-- Cinematic Engine v5 — Native Human UGC
-- Additive only: every column nullable / defaulted; v4 jobs unaffected.

-- 1) Settings extensions on singleton cinematic_ad_settings (id=true)
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS engine_version_default text NOT NULL DEFAULT 'v5',
  ADD COLUMN IF NOT EXISTS cinematic_v5_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS camera_styles jsonb NOT NULL DEFAULT
    '["iphone_vertical_closeup","pet_owner_followcam","floor_level_cat_cam","casual_lifestyle_pan","over_the_shoulder","reaction_selfie_style"]'::jsonb,
  ADD COLUMN IF NOT EXISTS handheld_jitter_amp numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS focus_breathing_amp numeric NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS exposure_drift_amp numeric NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS framing_correction_chance numeric NOT NULL DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS required_beats_v5 text[] NOT NULL DEFAULT
    ARRAY['hook','pattern_interrupt','problem','emotional_payoff','benefit','social_proof','cta']::text[],
  ADD COLUMN IF NOT EXISTS max_static_duration_frames_v5 int NOT NULL DEFAULT 54,
  ADD COLUMN IF NOT EXISTS scene_change_min_v5 int NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS scene_min_frames_v5 int NOT NULL DEFAULT 36,
  ADD COLUMN IF NOT EXISTS scene_max_frames_v5 int NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS min_motion_entropy int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS min_realism_consistency int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS min_ugc_authenticity int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS min_emotional_arc int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS min_thumb_stop_score int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS human_presence_required_ratio numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS environment_realism_min int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS ban_showroom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS style_bias_epsilon numeric NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS v5_reject_rate_rollback_threshold numeric NOT NULL DEFAULT 0.6;

-- 2) Job extensions
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS camera_style text,
  ADD COLUMN IF NOT EXISTS beats_v5 jsonb,
  ADD COLUMN IF NOT EXISTS motion_entropy_score numeric,
  ADD COLUMN IF NOT EXISTS realism_consistency_score numeric,
  ADD COLUMN IF NOT EXISTS ugc_authenticity_score numeric,
  ADD COLUMN IF NOT EXISTS emotional_arc_score numeric,
  ADD COLUMN IF NOT EXISTS thumb_stop_score numeric,
  ADD COLUMN IF NOT EXISTS human_presence_ratio numeric,
  ADD COLUMN IF NOT EXISTS environment_flags text[],
  ADD COLUMN IF NOT EXISTS v5_reject_reasons text[],
  ADD COLUMN IF NOT EXISTS validation_v5_passed boolean,
  ADD COLUMN IF NOT EXISTS emotional_register text,
  ADD COLUMN IF NOT EXISTS beat_signature text;

-- 3) Hook variants: add emotional register (if table exists from v4)
ALTER TABLE public.cinematic_hook_variants
  ADD COLUMN IF NOT EXISTS emotional_register text;

-- 4) Performance signals (per pin, refreshed by ingest cron)
CREATE TABLE IF NOT EXISTS public.cinematic_performance_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  pin_id text,
  outbound_ctr numeric DEFAULT 0,
  save_rate numeric DEFAULT 0,
  hold_rate numeric DEFAULT 0,
  completion_rate numeric DEFAULT 0,
  add_to_cart_rate numeric DEFAULT 0,
  composite_score numeric DEFAULT 0,
  window_days int DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, pin_id)
);
GRANT SELECT ON public.cinematic_performance_signals TO authenticated;
GRANT ALL ON public.cinematic_performance_signals TO service_role;
ALTER TABLE public.cinematic_performance_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read performance signals"
  ON public.cinematic_performance_signals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) Style bias table (epsilon-greedy weights per niche×camera×hook×beat)
CREATE TABLE IF NOT EXISTS public.cinematic_style_bias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL,
  camera_style text,
  hook_type text,
  beat_signature text,
  weight numeric NOT NULL DEFAULT 1.0,
  composite numeric NOT NULL DEFAULT 0,
  sample_size int NOT NULL DEFAULT 0,
  suppressed_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (niche, camera_style, hook_type, beat_signature)
);
GRANT SELECT ON public.cinematic_style_bias TO authenticated;
GRANT ALL ON public.cinematic_style_bias TO service_role;
ALTER TABLE public.cinematic_style_bias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read style bias"
  ON public.cinematic_style_bias FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_style_bias_lookup
  ON public.cinematic_style_bias (niche, camera_style);

-- 6) Seed default style-bias rows per niche × camera_style (weight=1.0)
INSERT INTO public.cinematic_style_bias (niche, camera_style, hook_type, beat_signature, weight)
SELECT n.niche, c.cam, NULL, NULL, 1.0
FROM (VALUES ('cat'),('dog'),('litter'),('grooming'),('toys'),('beds'),('general')) AS n(niche)
CROSS JOIN (VALUES
  ('iphone_vertical_closeup'),
  ('pet_owner_followcam'),
  ('floor_level_cat_cam'),
  ('casual_lifestyle_pan'),
  ('over_the_shoulder'),
  ('reaction_selfie_style')
) AS c(cam)
ON CONFLICT (niche, camera_style, hook_type, beat_signature) DO NOTHING;
