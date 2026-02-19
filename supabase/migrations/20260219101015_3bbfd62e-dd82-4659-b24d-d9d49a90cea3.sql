
-- Job runs table (orchestrator)
CREATE TABLE public.job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'schedule')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  triggered_by UUID,
  report JSON,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job run steps
CREATE TABLE public.job_run_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.job_runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_label TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result JSON,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job run logs (capped at latest per run via app logic)
CREATE TABLE public.job_run_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.job_runs(id) ON DELETE CASCADE,
  step_key TEXT,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  context JSON,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_job_runs_status ON public.job_runs(status);
CREATE INDEX idx_job_runs_created ON public.job_runs(created_at DESC);
CREATE INDEX idx_job_run_steps_run_id ON public.job_run_steps(run_id);
CREATE INDEX idx_job_run_logs_run_id ON public.job_run_logs(run_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_run_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can manage job_runs"
  ON public.job_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage job_run_steps"
  ON public.job_run_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage job_run_logs"
  ON public.job_run_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role needs direct access for edge functions
CREATE POLICY "Service role full access job_runs"
  ON public.job_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access job_run_steps"
  ON public.job_run_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access job_run_logs"
  ON public.job_run_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_job_runs_updated_at
  BEFORE UPDATE ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
