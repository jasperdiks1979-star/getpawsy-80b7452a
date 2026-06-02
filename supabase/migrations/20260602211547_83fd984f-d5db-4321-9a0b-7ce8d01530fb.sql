COMMENT ON COLUMN public.cinematic_ad_jobs.render_dispatched_at IS 'Timestamp when render job was dispatched to GitHub Actions';
NOTIFY pgrst, 'reload schema';