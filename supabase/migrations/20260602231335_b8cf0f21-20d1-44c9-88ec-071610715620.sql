CREATE TABLE public.executive_revenue_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revenue_today NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_7d NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_30d NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_30d NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders_30d INTEGER NOT NULL DEFAULT 0,
  aov_30d NUMERIC(12,2) NOT NULL DEFAULT 0,
  summary TEXT,
  winners JSONB NOT NULL DEFAULT '[]'::jsonb,
  losers JSONB NOT NULL DEFAULT '[]'::jsonb,
  opportunities JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_revenue_impact NUMERIC(12,2) NOT NULL DEFAULT 0,
  raw_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  trigger TEXT NOT NULL DEFAULT 'cron',
  UNIQUE (report_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_revenue_reports TO authenticated;
GRANT ALL ON public.executive_revenue_reports TO service_role;

ALTER TABLE public.executive_revenue_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read executive reports"
  ON public.executive_revenue_reports
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write executive reports"
  ON public.executive_revenue_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update executive reports"
  ON public.executive_revenue_reports
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_exec_reports_date ON public.executive_revenue_reports (report_date DESC);