ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS pinterest_pin_id text,
  ADD COLUMN IF NOT EXISTS pinterest_pin_url text,
  ADD COLUMN IF NOT EXISTS pinterest_publish_error text,
  ADD COLUMN IF NOT EXISTS pinterest_publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_pinterest_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_complete_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinterest_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

COMMENT ON COLUMN public.cinematic_ad_jobs.pinterest_pin_id IS 'Pinterest pin id once the auto-publish flow has created the pin.';
COMMENT ON COLUMN public.cinematic_ad_jobs.pinterest_pin_url IS 'Public Pinterest URL of the published pin (https://www.pinterest.com/pin/<id>/).';
COMMENT ON COLUMN public.cinematic_ad_jobs.pinterest_publish_error IS 'Latest auto-publish error from the Pinterest pipeline; cleared on success.';
COMMENT ON COLUMN public.cinematic_ad_jobs.pinterest_publish_attempts IS 'How many times the auto-publish chain has been attempted for this job.';