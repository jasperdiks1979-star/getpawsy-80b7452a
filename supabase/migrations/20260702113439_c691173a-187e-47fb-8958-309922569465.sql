
CREATE TABLE IF NOT EXISTS public.revenue_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  why_no_sale text NOT NULL,
  best_improvement text NOT NULL,
  improvement_reason text,
  expected_roi numeric NOT NULL DEFAULT 0,
  expected_revenue_usd numeric NOT NULL DEFAULT 0,
  confidence int NOT NULL DEFAULT 0,
  eta_minutes int NOT NULL DEFAULT 0,
  rollback text,
  funnel jsonb NOT NULL DEFAULT '{}'::jsonb,
  leaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  hero_product jsonb,
  live_buyers jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_audit_reports_date ON public.revenue_audit_reports(report_date DESC);
GRANT SELECT ON public.revenue_audit_reports TO authenticated;
GRANT ALL ON public.revenue_audit_reports TO service_role;
ALTER TABLE public.revenue_audit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read revenue audit reports"
  ON public.revenue_audit_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
