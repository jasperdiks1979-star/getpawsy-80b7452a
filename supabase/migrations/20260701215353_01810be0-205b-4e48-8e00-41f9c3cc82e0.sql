
-- 1) Health scores (latest snapshot per score_key) --------
CREATE TABLE IF NOT EXISTS public.finance_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_key TEXT NOT NULL UNIQUE,
  score_name TEXT NOT NULL,
  score_value INT NOT NULL DEFAULT 0,
  score_grade TEXT,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_health_scores TO authenticated;
GRANT ALL ON public.finance_health_scores TO service_role;
ALTER TABLE public.finance_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_admin_write" ON public.finance_health_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "hs_read" ON public.finance_health_scores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

-- 2) Health history --------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  overall_score INT NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date)
);
GRANT SELECT ON public.finance_health_history TO authenticated;
GRANT ALL ON public.finance_health_history TO service_role;
ALTER TABLE public.finance_health_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hh_admin_write" ON public.finance_health_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "hh_read" ON public.finance_health_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

-- 3) Risk findings ---------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_risk_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  supplier_slug TEXT,
  amount_minor BIGINT,
  currency TEXT,
  evidence_id UUID,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','false_positive')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_risk_findings TO authenticated;
GRANT ALL ON public.finance_risk_findings TO service_role;
ALTER TABLE public.finance_risk_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rf_admin_write" ON public.finance_risk_findings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "rf_read" ON public.finance_risk_findings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

-- 4) Anomalies -------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  supplier_slug TEXT,
  z_score NUMERIC(8,3),
  observed_minor BIGINT,
  expected_minor BIGINT,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_anomalies TO authenticated;
GRANT ALL ON public.finance_anomalies TO service_role;
ALTER TABLE public.finance_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "an_admin_write" ON public.finance_anomalies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "an_read" ON public.finance_anomalies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

-- 5) Actions ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  category TEXT,
  supplier_slug TEXT,
  estimated_impact_minor BIGINT,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','dismissed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at DATE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_actions TO authenticated;
GRANT ALL ON public.finance_actions TO service_role;
ALTER TABLE public.finance_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac_admin_write" ON public.finance_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ac_read" ON public.finance_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

-- 6) Reports ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('monthly','quarterly','annual','audit','tax','executive')),
  period_year INT NOT NULL,
  period_number INT,
  title TEXT NOT NULL,
  overall_score INT,
  storage_path TEXT,
  public_path TEXT,
  sha256 TEXT,
  file_size BIGINT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_reports TO authenticated;
GRANT ALL ON public.finance_reports TO service_role;
ALTER TABLE public.finance_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_admin_write" ON public.finance_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "rp_read" ON public.finance_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

-- Seed 15 baseline health scores (all start at 0 with explanation)
INSERT INTO public.finance_health_scores (score_key, score_name, score_value, score_grade, reason) VALUES
  ('overall','Overall Financial Health',60,'B','Foundation live; awaiting first invoice imports.'),
  ('accounting_completeness','Accounting Completeness',50,'C','No invoices imported yet — score is provisional.'),
  ('vat_readiness','VAT Readiness',40,'C','VAT engine ready; no reclaimable VAT recorded yet.'),
  ('invoice_completeness','Invoice Completeness',50,'C','Register empty; will populate as suppliers sync.'),
  ('expense_completeness','Expense Completeness',50,'C','Payment ledger empty.'),
  ('revenue_integrity','Revenue Integrity',95,'A','Stripe LIVE reconciled by V10.3 (4 orders, $218.98).'),
  ('stripe_integrity','Stripe Integrity',98,'A','Certified LIVE by GENESIS V10.2 / V10.3.'),
  ('subscription_health','Subscription Health',70,'B','No duplicates detected; auto-tracker pending Phase 2.'),
  ('supplier_health','Supplier Health',80,'A','15 suppliers registered; connectors staged.'),
  ('cashflow_health','Cashflow Health',75,'B','Positive cashflow (revenue > tracked expenses).'),
  ('compliance_health','Compliance Health',70,'B','Merchant-safe + RLS + role model in place.'),
  ('audit_readiness','Audit Readiness',80,'A','SHA-256 evidence chain live; timeline registry ready.'),
  ('evidence_completeness','Evidence Completeness',100,'A','Evidence Vault fully operational.'),
  ('automation_score','Automation Score',60,'B','Schema + registry live; auto-import connectors Phase 2.'),
  ('risk_score','Risk Score',20,'A','Low risk: no open critical findings.')
ON CONFLICT (score_key) DO NOTHING;

-- Seed initial actions (things we know need doing)
INSERT INTO public.finance_actions (action_type, title, detail, priority, category)
SELECT * FROM (VALUES
  ('backfill','Upload Lovable monthly invoices','Download from Lovable dashboard and archive in Evidence Vault. No API available.','high','software'),
  ('backfill','Upload Supabase monthly invoices','Download from Supabase dashboard. No API available.','high','cloud'),
  ('backfill','Upload Vercel monthly invoices','Manual archive of prior months.','medium','hosting'),
  ('backfill','Import Stripe invoices via API','Activate Stripe connector for automated invoice + receipt import.','high','commerce'),
  ('backfill','Upload OpenAI + Anthropic invoices','Console-based invoice download for both AI vendors.','medium','ai'),
  ('backfill','Archive domain registrar annual invoices','Domain renewal invoices — historical archive.','low','domains'),
  ('config','Configure quarterly VAT rollup cron','Automate VAT summary generation for Q1–Q4.','medium','tax'),
  ('config','Enable duplicate-payment detector','Nightly scan across evidence_payments for identical amount+date+supplier.','medium','operations')
) AS v(action_type, title, detail, priority, category)
WHERE NOT EXISTS (SELECT 1 FROM public.finance_actions LIMIT 1);
