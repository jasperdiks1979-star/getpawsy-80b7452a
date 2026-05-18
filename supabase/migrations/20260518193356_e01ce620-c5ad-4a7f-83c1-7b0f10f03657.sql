ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS voice_style text,
  ADD COLUMN IF NOT EXISTS pin_title text,
  ADD COLUMN IF NOT EXISTS pin_description text,
  ADD COLUMN IF NOT EXISTS pin_destination_url text,
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS approved_for_render boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_approved_for_render
  ON public.cinematic_ad_jobs(approved_for_render, status);