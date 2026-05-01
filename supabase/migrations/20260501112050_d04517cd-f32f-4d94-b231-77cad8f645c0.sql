-- Log table for monitor attempts (retry mechanism)
CREATE TABLE IF NOT EXISTS public.stock_refresh_monitor_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.stock_refresh_runs(id) ON DELETE SET NULL,
  trace_id uuid NOT NULL,
  attempt_number int NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error', 'retrying')),
  error_message text,
  error_stack text,
  duration_ms int,
  remaining int,
  synced_ok int,
  synced_error int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_refresh_monitor_attempts_created_at
  ON public.stock_refresh_monitor_attempts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_refresh_monitor_attempts_run_id
  ON public.stock_refresh_monitor_attempts (run_id, created_at DESC);

ALTER TABLE public.stock_refresh_monitor_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can read attempts
CREATE POLICY "Admins can read monitor attempts"
  ON public.stock_refresh_monitor_attempts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));