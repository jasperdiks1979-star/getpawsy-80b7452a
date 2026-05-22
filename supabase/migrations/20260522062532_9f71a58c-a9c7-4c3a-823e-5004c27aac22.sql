-- 1. Additive columns on cinematic_ad_jobs
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS hook_text TEXT,
  ADD COLUMN IF NOT EXISTS hook_type TEXT,
  ADD COLUMN IF NOT EXISTS scene_entropy_score NUMERIC,
  ADD COLUMN IF NOT EXISTS motion_diversity_score NUMERIC,
  ADD COLUMN IF NOT EXISTS caption_visibility_score NUMERIC,
  ADD COLUMN IF NOT EXISTS mobile_readability_score NUMERIC,
  ADD COLUMN IF NOT EXISTS hook_strength_score NUMERIC,
  ADD COLUMN IF NOT EXISTS pacing_quality_score NUMERIC,
  ADD COLUMN IF NOT EXISTS visual_energy_score NUMERIC,
  ADD COLUMN IF NOT EXISTS retention_likelihood_score NUMERIC,
  ADD COLUMN IF NOT EXISTS cta_clarity_score NUMERIC,
  ADD COLUMN IF NOT EXISTS style_preset TEXT DEFAULT 'pinterest_native',
  ADD COLUMN IF NOT EXISTS scene_plan JSONB,
  ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT 'v2';

-- 2. Engine version on settings
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS safe_zone_debug BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_scenes INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_scenes INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS min_motion_diversity NUMERIC DEFAULT 40,
  ADD COLUMN IF NOT EXISTS min_scene_diversity NUMERIC DEFAULT 40,
  ADD COLUMN IF NOT EXISTS min_caption_visibility NUMERIC DEFAULT 70;

-- 3. Style presets
CREATE TABLE IF NOT EXISTS public.cinematic_ad_style_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  pacing_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  caption_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  motion_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cinematic_ad_style_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Style presets readable by authenticated" ON public.cinematic_ad_style_presets;
CREATE POLICY "Style presets readable by authenticated"
  ON public.cinematic_ad_style_presets FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage style presets" ON public.cinematic_ad_style_presets;
CREATE POLICY "Admins manage style presets"
  ON public.cinematic_ad_style_presets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Creative DNA
CREATE TABLE IF NOT EXISTS public.cinematic_creative_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dna_fingerprint TEXT UNIQUE NOT NULL,
  hook_type TEXT,
  scene_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  motion_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  style_preset TEXT,
  performance JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_count INTEGER NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_dna_score ON public.cinematic_creative_dna(score DESC);

ALTER TABLE public.cinematic_creative_dna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view creative dna" ON public.cinematic_creative_dna;
CREATE POLICY "Admins view creative dna"
  ON public.cinematic_creative_dna FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage creative dna" ON public.cinematic_creative_dna;
CREATE POLICY "Admins manage creative dna"
  ON public.cinematic_creative_dna FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Seed style presets
INSERT INTO public.cinematic_ad_style_presets (preset_name, display_name, pacing_config, caption_config, motion_config)
VALUES
  ('pinterest_native', 'Pinterest Native',
   '{"hook_duration_frames": 36, "scene_min_frames": 45, "scene_max_frames": 75, "cta_duration_frames": 90, "pattern_interrupt_every": 60}'::jsonb,
   '{"max_lines": 3, "max_chars_per_line": 22, "font_size_min": 56, "font_size_max": 96, "safe_top_pct": 12, "safe_bottom_pct": 22, "safe_side_pct": 6}'::jsonb,
   '{"primary": ["push_in", "parallax", "crop_shift", "rack_focus"], "transition": ["motion_blur", "whip_pan", "fade"], "max_consecutive_repeat": 1}'::jsonb),
  ('tiktok_native', 'TikTok Native',
   '{"hook_duration_frames": 30, "scene_min_frames": 36, "scene_max_frames": 60, "cta_duration_frames": 75, "pattern_interrupt_every": 45}'::jsonb,
   '{"max_lines": 2, "max_chars_per_line": 18, "font_size_min": 64, "font_size_max": 110, "safe_top_pct": 14, "safe_bottom_pct": 26, "safe_side_pct": 7}'::jsonb,
   '{"primary": ["push_in", "whip_pan", "speed_ramp", "handheld"], "transition": ["whip_pan", "motion_blur", "cut"], "max_consecutive_repeat": 1}'::jsonb)
ON CONFLICT (preset_name) DO UPDATE SET
  pacing_config = EXCLUDED.pacing_config,
  caption_config = EXCLUDED.caption_config,
  motion_config = EXCLUDED.motion_config,
  updated_at = now();

-- 6. Update timestamp triggers (reuse existing function)
DROP TRIGGER IF EXISTS update_style_presets_updated_at ON public.cinematic_ad_style_presets;
CREATE TRIGGER update_style_presets_updated_at
  BEFORE UPDATE ON public.cinematic_ad_style_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_creative_dna_updated_at ON public.cinematic_creative_dna;
CREATE TRIGGER update_creative_dna_updated_at
  BEFORE UPDATE ON public.cinematic_creative_dna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();