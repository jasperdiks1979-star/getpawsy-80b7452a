ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS caption_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vo_script_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_index integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cinematic_ad_jobs.caption_variants IS
  'Array of 6 sub-arrays, each containing N alternative caption strings for that scene (caption_variants[sceneIdx][variantIdx]).';
COMMENT ON COLUMN public.cinematic_ad_jobs.vo_script_variants IS
  'Array of N alternative voiceover scripts; the selected one is mirrored into vo_script.';
COMMENT ON COLUMN public.cinematic_ad_jobs.variant_index IS
  'Which variant index (0-based) was selected for this job; auto-rotates per product to avoid repetition unless overridden.';