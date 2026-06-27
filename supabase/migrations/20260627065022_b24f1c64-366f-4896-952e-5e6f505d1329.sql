
CREATE TABLE IF NOT EXISTS public.cro_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  conversion_probability_score numeric,
  trust_score numeric,
  friction_score numeric,
  mobile_usability_score numeric,
  expected_conversion_rate numeric,
  revenue_impact_30d numeric,
  surfaces_audited int DEFAULT 0,
  findings_total int DEFAULT 0,
  auto_fixes_applied int DEFAULT 0,
  notes jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.cro_audit_runs TO authenticated;
GRANT ALL ON public.cro_audit_runs TO service_role;
ALTER TABLE public.cro_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cro_audit_runs admin read" ON public.cro_audit_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.cro_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.cro_audit_runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  surface text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text,
  evidence jsonb DEFAULT '{}'::jsonb,
  expected_cr_lift_pct numeric DEFAULT 0,
  revenue_impact_30d numeric DEFAULT 0,
  roi_rank int,
  auto_fixable boolean DEFAULT false,
  auto_fixed boolean DEFAULT false,
  requires_approval boolean DEFAULT false,
  status text NOT NULL DEFAULT 'open'
);
GRANT SELECT ON public.cro_findings TO authenticated;
GRANT ALL ON public.cro_findings TO service_role;
ALTER TABLE public.cro_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cro_findings admin read" ON public.cro_findings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.cro_autofix_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.cro_audit_runs(id) ON DELETE SET NULL,
  finding_id uuid REFERENCES public.cro_findings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  target text,
  before_state jsonb,
  after_state jsonb,
  rolled_back boolean DEFAULT false,
  rollback_at timestamptz,
  notes text
);
GRANT SELECT ON public.cro_autofix_log TO authenticated;
GRANT ALL ON public.cro_autofix_log TO service_role;
ALTER TABLE public.cro_autofix_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cro_autofix_log admin read" ON public.cro_autofix_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.cro_ux_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text,
  path text,
  signal_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  device text,
  viewport_w int,
  viewport_h int
);
GRANT INSERT ON public.cro_ux_signals TO anon, authenticated;
GRANT ALL ON public.cro_ux_signals TO service_role;
ALTER TABLE public.cro_ux_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cro_ux_signals anon insert" ON public.cro_ux_signals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "cro_ux_signals admin read" ON public.cro_ux_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_cro_findings_run ON public.cro_findings(run_id, roi_rank);
CREATE INDEX IF NOT EXISTS idx_cro_ux_signals_path ON public.cro_ux_signals(path, signal_type, created_at DESC);
