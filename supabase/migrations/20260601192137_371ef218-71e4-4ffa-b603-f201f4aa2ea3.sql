ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS motion_engine_used text,
  ADD COLUMN IF NOT EXISTS transition_count integer,
  ADD COLUMN IF NOT EXISTS motion_diversity_v2 numeric;