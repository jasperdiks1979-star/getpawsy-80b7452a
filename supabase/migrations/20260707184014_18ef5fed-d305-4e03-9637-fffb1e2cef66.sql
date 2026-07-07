
CREATE TABLE IF NOT EXISTS public.pinterest_recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  priority int NOT NULL DEFAULT 100,
  run_id uuid NULL,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 1,
  result jsonb NULL,
  error text NULL,
  requested_by uuid NULL,
  locked_at timestamptz NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pinterest_recovery_jobs TO authenticated;
GRANT ALL ON public.pinterest_recovery_jobs TO service_role;

ALTER TABLE public.pinterest_recovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read recovery jobs"
  ON public.pinterest_recovery_jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins enqueue recovery jobs"
  ON public.pinterest_recovery_jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND requested_by = auth.uid());

CREATE POLICY "admins cancel recovery jobs"
  ON public.pinterest_recovery_jobs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pinterest_recovery_jobs_pending_idx
  ON public.pinterest_recovery_jobs (priority ASC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS pinterest_recovery_jobs_status_idx
  ON public.pinterest_recovery_jobs (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.pinterest_recovery_jobs_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pinterest_recovery_jobs_touch ON public.pinterest_recovery_jobs;
CREATE TRIGGER trg_pinterest_recovery_jobs_touch
  BEFORE UPDATE ON public.pinterest_recovery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.pinterest_recovery_jobs_touch();
