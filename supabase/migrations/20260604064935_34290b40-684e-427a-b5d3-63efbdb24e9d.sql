ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS admin_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS latest_github_run_id text,
  ADD COLUMN IF NOT EXISTS render_exit_code integer,
  ADD COLUMN IF NOT EXISTS output_file_size_mb numeric;

COMMENT ON COLUMN public.cinematic_ad_jobs.admin_diagnostics IS
  'Per-job pipeline diagnostics: { latest_github_run_id, render_exit_code, output_file_size_mb, webhook_response_body, last_status_update, render_output_path, output_file_exists, upload_url_created, job_updated_output_mp4_url, repair_history }';