
-- ACOS Wave B: dispatcher + approval + health tables

ALTER TABLE public.acos_decisions
  ADD COLUMN IF NOT EXISTS dispatch_idempotency_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_result jsonb,
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS risk_score numeric;

CREATE INDEX IF NOT EXISTS acos_decisions_status_idx ON public.acos_decisions(status);
CREATE INDEX IF NOT EXISTS acos_decisions_pending_idx ON public.acos_decisions(status) WHERE status = 'pending_approval';

ALTER TABLE public.acos_settings
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS autonomous_mutations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engine_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Dispatch log
CREATE TABLE IF NOT EXISTS public.acos_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES public.acos_decisions(id) ON DELETE SET NULL,
  decision_type text,
  outcome text NOT NULL,
  blocked_reason text,
  target_function text,
  request_payload jsonb,
  response_payload jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.acos_dispatch_log TO authenticated;
GRANT ALL ON public.acos_dispatch_log TO service_role;
ALTER TABLE public.acos_dispatch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read acos_dispatch_log"
  ON public.acos_dispatch_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Health snapshots
CREATE TABLE IF NOT EXISTS public.acos_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  engines jsonb NOT NULL DEFAULT '{}'::jsonb,
  queue jsonb NOT NULL DEFAULT '{}'::jsonb,
  guardian jsonb NOT NULL DEFAULT '{}'::jsonb,
  ci_layer jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispatcher jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_status text NOT NULL DEFAULT 'unknown',
  notes text
);
GRANT SELECT ON public.acos_health_snapshots TO authenticated;
GRANT ALL ON public.acos_health_snapshots TO service_role;
ALTER TABLE public.acos_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read acos_health_snapshots"
  ON public.acos_health_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Alerts
CREATE TABLE IF NOT EXISTS public.acos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL,
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acos_alerts_open_idx ON public.acos_alerts(status, severity, created_at DESC);
GRANT SELECT, UPDATE ON public.acos_alerts TO authenticated;
GRANT ALL ON public.acos_alerts TO service_role;
ALTER TABLE public.acos_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read acos_alerts"
  ON public.acos_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins ack acos_alerts"
  ON public.acos_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to approve/reject decisions
DROP POLICY IF EXISTS "Admins update acos_decisions" ON public.acos_decisions;
CREATE POLICY "Admins update acos_decisions"
  ON public.acos_decisions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
