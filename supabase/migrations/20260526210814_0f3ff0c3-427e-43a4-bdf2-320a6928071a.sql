
-- =====================================================
-- Cinematic Engine v4 — Native Short-Form Quality Upgrade
-- =====================================================

-- 1. New columns on cinematic_ad_jobs
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS scene_roles jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scene_change_count integer,
  ADD COLUMN IF NOT EXISTS camera_motion_score numeric,
  ADD COLUMN IF NOT EXISTS realism_score numeric,
  ADD COLUMN IF NOT EXISTS engagement_pacing_score numeric,
  ADD COLUMN IF NOT EXISTS human_flags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qa_preview_url text,
  ADD COLUMN IF NOT EXISTS qa_preview_flags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS focal_bbox jsonb,
  ADD COLUMN IF NOT EXISTS style_preset_key text,
  ADD COLUMN IF NOT EXISTS hook_variant_id uuid,
  ADD COLUMN IF NOT EXISTS validation_v4_passed boolean,
  ADD COLUMN IF NOT EXISTS v4_reject_reasons jsonb DEFAULT '[]'::jsonb;

-- 2. v4 tunables on cinematic_ad_settings
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS cinematic_v4_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS engine_version_default text NOT NULL DEFAULT 'v4',
  ADD COLUMN IF NOT EXISTS hook_change_max_frames integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS scene_min_frames_v4 integer NOT NULL DEFAULT 36,
  ADD COLUMN IF NOT EXISTS scene_max_frames_v4 integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS static_hold_max_frames integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS pattern_interrupt_every_min_frames integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS pattern_interrupt_every_max_frames integer NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS min_scene_count_v4 integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS required_scene_roles jsonb NOT NULL DEFAULT '["hook","problem","benefit","cta"]'::jsonb,
  ADD COLUMN IF NOT EXISTS min_camera_motion_score integer NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS min_realism_score integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS min_engagement_pacing_score integer NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS human_realism_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS human_realism_min integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS qa_preview_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS style_suppression_days integer NOT NULL DEFAULT 7;

-- 3. New table: cinematic_hook_variants (per-product hook bank)
CREATE TABLE IF NOT EXISTS public.cinematic_hook_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  product_category text,
  hook_text text NOT NULL,
  hook_type text NOT NULL CHECK (hook_type IN ('curiosity','emotional','transformation','problem_solution','authority_social_proof')),
  predicted_ctr numeric,
  predicted_ctr_rationale text,
  uses integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinematic_hook_variants TO authenticated;
GRANT ALL ON public.cinematic_hook_variants TO service_role;
ALTER TABLE public.cinematic_hook_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cinematic_hook_variants"
  ON public.cinematic_hook_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_hook_variants_slug ON public.cinematic_hook_variants(product_slug) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_hook_variants_type ON public.cinematic_hook_variants(hook_type);

-- 4. New table: cinematic_style_weights (rolled up performance per preset+hook+niche)
CREATE TABLE IF NOT EXISTS public.cinematic_style_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_preset_key text NOT NULL,
  hook_type text,
  niche_key text,
  sample_size integer NOT NULL DEFAULT 0,
  avg_ctr numeric,
  avg_save_rate numeric,
  avg_hold_rate numeric,
  avg_completion numeric,
  composite_score numeric,
  weight numeric NOT NULL DEFAULT 1.0,
  suppressed_until timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (style_preset_key, hook_type, niche_key)
);
GRANT SELECT ON public.cinematic_style_weights TO authenticated;
GRANT ALL ON public.cinematic_style_weights TO service_role;
ALTER TABLE public.cinematic_style_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cinematic_style_weights"
  ON public.cinematic_style_weights FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_style_weights_lookup ON public.cinematic_style_weights(style_preset_key, hook_type, niche_key);

-- 5. updated_at trigger
DROP TRIGGER IF EXISTS trg_hook_variants_updated_at ON public.cinematic_hook_variants;
CREATE TRIGGER trg_hook_variants_updated_at
  BEFORE UPDATE ON public.cinematic_hook_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
