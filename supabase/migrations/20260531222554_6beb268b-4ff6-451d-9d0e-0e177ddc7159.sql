ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS hook_candidates jsonb,
  ADD COLUMN IF NOT EXISTS hook_winner_reason text,
  ADD COLUMN IF NOT EXISTS story_arc jsonb,
  ADD COLUMN IF NOT EXISTS motion_plan_summary jsonb,
  ADD COLUMN IF NOT EXISTS regenerate_reason text;