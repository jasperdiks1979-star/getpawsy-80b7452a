ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS text_safe_rewrite_passes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS text_safe_rewrite_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS text_safe_rewrite_mutations jsonb;