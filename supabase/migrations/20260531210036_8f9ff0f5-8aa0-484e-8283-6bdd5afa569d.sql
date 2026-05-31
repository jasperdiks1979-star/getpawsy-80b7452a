
-- Job-level score columns
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS hook_score integer,
  ADD COLUMN IF NOT EXISTS voice_score integer,
  ADD COLUMN IF NOT EXISTS commercial_score integer,
  ADD COLUMN IF NOT EXISTS ctr_prediction_score integer,
  ADD COLUMN IF NOT EXISTS final_creative_score integer,
  ADD COLUMN IF NOT EXISTS hook_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hard_reject_reasons text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS emotional_payoff_present boolean,
  ADD COLUMN IF NOT EXISTS regenerate_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS regenerate_requested_by uuid,
  ADD COLUMN IF NOT EXISTS regenerate_count integer NOT NULL DEFAULT 0;

-- New settings columns for Domination Mode
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS min_hook_score integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_voice_score integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_ctr_prediction_score integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_final_creative_score integer NOT NULL DEFAULT 95,
  ADD COLUMN IF NOT EXISTS min_emotional_payoff_v7 integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS require_cta_scene_v7 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hard_reject_single_image boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hard_reject_ken_burns_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS creative_domination_mode boolean NOT NULL DEFAULT true;

-- Tighten existing thresholds to Domination Mode defaults
UPDATE public.cinematic_ad_settings
SET
  min_pinterest_quality_score = GREATEST(COALESCE(min_pinterest_quality_score, 0), 95),
  min_scene_count_v7          = GREATEST(COALESCE(min_scene_count_v7, 0), 5),
  min_unique_scenes_v7        = GREATEST(COALESCE(min_unique_scenes_v7, 0), 5),
  min_unique_cameras_v7       = GREATEST(COALESCE(min_unique_cameras_v7, 0), 3),
  min_closeups_v7             = GREATEST(COALESCE(min_closeups_v7, 0), 1),
  min_lifestyle_v7            = GREATEST(COALESCE(min_lifestyle_v7, 0), 1),
  min_product_demo_v7         = GREATEST(COALESCE(min_product_demo_v7, 0), 1),
  text_safe_zone_tolerance    = 0,
  cinematic_v7_enabled        = true,
  updated_at                  = now()
WHERE id = true;
