ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS safari_playback_check jsonb,
  ADD COLUMN IF NOT EXISTS safari_playback_passed boolean,
  ADD COLUMN IF NOT EXISTS safari_playback_checked_at timestamptz;

COMMENT ON COLUMN public.cinematic_ad_jobs.safari_playback_check IS
  'Structured iPhone Safari playability report (HEAD+Range probe: mime, Accept-Ranges, 206, CORS, faststart moov) written after every render/trim callback.';