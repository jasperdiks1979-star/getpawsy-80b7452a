
CREATE TABLE IF NOT EXISTS public.revenue_root_cause_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  window_hours integer NOT NULL,
  total_sessions integer NOT NULL DEFAULT 0,
  total_purchases integer NOT NULL DEFAULT 0,
  baseline_aov_cents integer NOT NULL DEFAULT 3500,
  baseline_cvr numeric(6,4) NOT NULL DEFAULT 0.02,
  ok boolean NOT NULL DEFAULT true,
  error text,
  duration_ms integer
);
GRANT SELECT ON public.revenue_root_cause_runs TO authenticated;
GRANT ALL ON public.revenue_root_cause_runs TO service_role;
ALTER TABLE public.revenue_root_cause_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "root_cause_runs admin read" ON public.revenue_root_cause_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.revenue_root_cause_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.revenue_root_cause_runs(run_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rank integer NOT NULL,
  finding_type text NOT NULL,               -- 'exit_reason' | 'landing_page' | 'product' | 'device' | 'country' | 'pin' | 'utm_source' | 'browser'
  dimension_value text NOT NULL,
  exit_reason text,                          -- primary exit reason bucket
  sessions integer NOT NULL,
  pct_of_total numeric(6,3) NOT NULL,
  est_revenue_loss_cents bigint NOT NULL DEFAULT 0,
  confidence integer NOT NULL,               -- 0..100
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_repair text,
  auto_fixable boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_rcf_run   ON public.revenue_root_cause_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_rcf_type  ON public.revenue_root_cause_findings(finding_type, rank);
GRANT SELECT ON public.revenue_root_cause_findings TO authenticated;
GRANT ALL ON public.revenue_root_cause_findings TO service_role;
ALTER TABLE public.revenue_root_cause_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "root_cause_findings admin read" ON public.revenue_root_cause_findings
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.revenue_auto_fix_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  fix_type text NOT NULL,           -- whitelist: 'alt_text'|'og_tag'|'schema_repair'|'sitemap_refresh'
  target text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  expected_impact text,
  rollback_token text NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  dry_run boolean NOT NULL DEFAULT true,
  finding_id uuid REFERENCES public.revenue_root_cause_findings(id) ON DELETE SET NULL
);
GRANT SELECT ON public.revenue_auto_fix_log TO authenticated;
GRANT ALL ON public.revenue_auto_fix_log TO service_role;
ALTER TABLE public.revenue_auto_fix_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_fix_log admin read" ON public.revenue_auto_fix_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
