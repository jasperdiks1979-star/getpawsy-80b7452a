
-- GENESIS Ω — Business Health Index (BHI)
CREATE TABLE public.bhi_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_score NUMERIC(5,2) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL,
  trend NUMERIC(5,2),
  yesterday_score NUMERIC(5,2),
  simulation JSONB NOT NULL DEFAULT '{}'::jsonb,
  priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
  executive_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bhi_snapshots_captured_idx ON public.bhi_snapshots (captured_at DESC);
GRANT SELECT ON public.bhi_snapshots TO authenticated;
GRANT ALL ON public.bhi_snapshots TO service_role;
ALTER TABLE public.bhi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bhi_snap_admin_read" ON public.bhi_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bhi_subscores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES public.bhi_snapshots(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subscore_key TEXT NOT NULL,
  label TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  weight NUMERIC(6,3) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  trend NUMERIC(5,2),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bhi_sub_snap_idx ON public.bhi_subscores (snapshot_id);
GRANT SELECT ON public.bhi_subscores TO authenticated;
GRANT ALL ON public.bhi_subscores TO service_role;
ALTER TABLE public.bhi_subscores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bhi_sub_admin_read" ON public.bhi_subscores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bhi_weights (
  subscore_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  weight NUMERIC(6,3) NOT NULL,
  rationale TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bhi_weights TO authenticated;
GRANT ALL ON public.bhi_weights TO service_role;
ALTER TABLE public.bhi_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bhi_weights_admin_read" ON public.bhi_weights FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bhi_briefings (
  briefing_date DATE PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES public.bhi_snapshots(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2) NOT NULL,
  yesterday_score NUMERIC(5,2),
  trend NUMERIC(5,2),
  top_opportunity TEXT,
  top_threat TEXT,
  top_revenue_leak TEXT,
  top_revenue_opportunity TEXT,
  highest_roi TEXT,
  critical_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_revenue_today NUMERIC(12,2),
  expected_profit_today NUMERIC(12,2),
  confidence NUMERIC(5,2),
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bhi_briefings TO authenticated;
GRANT ALL ON public.bhi_briefings TO service_role;
ALTER TABLE public.bhi_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bhi_brief_admin_read" ON public.bhi_briefings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bhi_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID REFERENCES public.bhi_snapshots(id) ON DELETE SET NULL,
  audit_type TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bhi_audit_snap_idx ON public.bhi_audit_log (snapshot_id);
GRANT SELECT ON public.bhi_audit_log TO authenticated;
GRANT ALL ON public.bhi_audit_log TO service_role;
ALTER TABLE public.bhi_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bhi_audit_admin_read" ON public.bhi_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed weights (documented, evidence-based, sum ~ 100)
INSERT INTO public.bhi_weights (subscore_key, category, label, weight, rationale) VALUES
  ('revenue_health','Revenue','Revenue Health',8,'Direct outcome KPI - paid orders trajectory'),
  ('profitability_health','Revenue','Profitability Health',6,'Gross profit after COGS proxy'),
  ('cashflow_health','Revenue','Cashflow Health',3,'Realized cash from paid orders'),
  ('sales_readiness','Revenue','Sales Readiness',6,'CEO Score composite'),
  ('conversion_health','Conversion','Conversion Health',6,'PDP->ATC->CHK->PAID funnel'),
  ('checkout_health','Conversion','Checkout Health',5,'Paid vs expired ratio'),
  ('stripe_health','Conversion','Stripe Health',3,'Stripe brand/session integrity'),
  ('mobile_ux','Conversion','Mobile UX',2,'Mobile funnel stability'),
  ('desktop_ux','Conversion','Desktop UX',1,'Desktop funnel stability'),
  ('core_web_vitals','Conversion','Core Web Vitals',2,'LCP/CLS/INP field data'),
  ('pinterest_health','Marketing','Pinterest Health',4,'Pins published + guardian pass'),
  ('seo_health','Marketing','SEO Health',3,'GSC signals baseline'),
  ('organic_growth','Marketing','Organic Growth',2,'Organic sessions trend'),
  ('paid_marketing','Marketing','Paid Marketing Health',1,'Ads spend efficiency'),
  ('traffic_quality','Marketing','Traffic Quality',3,'Human vs bot ratio'),
  ('tracking_integrity','Truth','Tracking Integrity',4,'Canonical events completeness'),
  ('unified_truth','Truth','Unified Truth',3,'Cross-source metric consistency'),
  ('customer_trust','Trust','Customer Trust',3,'Brand+Stripe alignment'),
  ('product_quality','Product','Product Quality',3,'In-stock catalog readiness'),
  ('inventory_health','Product','Inventory Health',2,'In-stock/total ratio'),
  ('creative_quality','Creative','Creative Quality',2,'Guardian pass rate'),
  ('golden_dna','Creative','Golden DNA',1,'Winner DNA library depth'),
  ('pre_health','Creative','PRE Health',2,'Product Relevance gate'),
  ('native_health','Creative','Native Health',1,'Native placement gate'),
  ('integrity_guard','Creative','Integrity Guard',1,'Guardian violations'),
  ('ai_economics','AI','AI Economics',3,'Credits per attributed dollar'),
  ('credit_efficiency','AI','AI Credit Efficiency',2,'Weekly budget adherence'),
  ('edge_functions','Infra','Edge Functions',2,'5xx rate on functions'),
  ('database_health','Infra','Database Health',2,'Connection saturation + errors'),
  ('worker_health','Infra','Worker Health',1,'Heartbeat freshness'),
  ('queue_health','Infra','Queue Health',1,'Backlog depth vs throughput'),
  ('deployment_stability','Infra','Deployment Stability',1,'Recent deploy errors'),
  ('monitoring','Infra','Monitoring',1,'Alert coverage'),
  ('security','Compliance','Security',2,'Open critical findings'),
  ('privacy','Compliance','Privacy',1,'Consent/GDPR posture'),
  ('tax_readiness','Compliance','Tax Readiness',1,'VAT summaries current'),
  ('invoice_completeness','Compliance','Invoice Completeness',1,'Evidence vault coverage'),
  ('finance_readiness','Compliance','Finance Readiness',2,'Evidence + reconciliation'),
  ('backup_health','Compliance','Backup Health',1,'Evidence backup checks'),
  ('architecture_health','Meta','Architecture Health',1,'Simplification score'),
  ('automation_health','Meta','Automation Health',1,'Autonomous action success rate');
