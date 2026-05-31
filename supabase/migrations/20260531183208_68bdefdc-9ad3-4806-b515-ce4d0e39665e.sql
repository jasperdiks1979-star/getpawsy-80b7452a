
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS scene_diversity_v7_score numeric,
  ADD COLUMN IF NOT EXISTS camera_diversity_score numeric,
  ADD COLUMN IF NOT EXISTS hook_strength_v7_score numeric,
  ADD COLUMN IF NOT EXISTS text_safety_score numeric,
  ADD COLUMN IF NOT EXISTS pinterest_quality_score numeric,
  ADD COLUMN IF NOT EXISTS v7_reject_reasons text[],
  ADD COLUMN IF NOT EXISTS validation_v7_passed boolean;

ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS cinematic_v7_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_pinterest_quality_score numeric NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_unique_scenes_v7 integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS min_unique_cameras_v7 integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS min_scene_count_v7 integer NOT NULL DEFAULT 5;
