
ALTER TABLE public.pinterest_recovery_jobs
  ADD COLUMN IF NOT EXISTS audit_run_id uuid,
  ADD COLUMN IF NOT EXISTS audit_http_status integer,
  ADD COLUMN IF NOT EXISTS audit_response jsonb,
  ADD COLUMN IF NOT EXISTS republish_http_status integer,
  ADD COLUMN IF NOT EXISTS republish_response jsonb,
  ADD COLUMN IF NOT EXISTS dispatch_steps jsonb,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_stage text;

CREATE INDEX IF NOT EXISTS pinterest_recovery_jobs_audit_run_id_idx
  ON public.pinterest_recovery_jobs (audit_run_id);
CREATE INDEX IF NOT EXISTS pinterest_recovery_jobs_dispatched_at_idx
  ON public.pinterest_recovery_jobs (dispatched_at DESC);
