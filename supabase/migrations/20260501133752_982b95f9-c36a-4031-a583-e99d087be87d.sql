ALTER TABLE public.monitoring_runs
  ADD COLUMN IF NOT EXISTS function_name TEXT,
  ADD COLUMN IF NOT EXISTS trace_id UUID,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS new_alerts TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_monitoring_runs_function ON public.monitoring_runs (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_trace ON public.monitoring_runs (trace_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_created_at ON public.monitoring_runs (created_at DESC);

ALTER TABLE public.monitoring_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read monitoring runs" ON public.monitoring_runs;
CREATE POLICY "Admins can read monitoring runs"
ON public.monitoring_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));