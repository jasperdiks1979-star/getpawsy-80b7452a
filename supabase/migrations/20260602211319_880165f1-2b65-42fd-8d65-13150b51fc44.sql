ALTER TABLE public.cinematic_ad_jobs ADD COLUMN IF NOT EXISTS render_dispatched_at timestamptz;
NOTIFY pgrst, 'reload schema';