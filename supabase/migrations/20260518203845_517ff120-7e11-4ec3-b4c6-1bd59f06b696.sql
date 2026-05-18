
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS hook_variants_meta jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_variants_meta  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS storyboard         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_hook_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_cta_index  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hook_text    text,
  ADD COLUMN IF NOT EXISTS subhook_text text,
  ADD COLUMN IF NOT EXISTS cta_text     text;
