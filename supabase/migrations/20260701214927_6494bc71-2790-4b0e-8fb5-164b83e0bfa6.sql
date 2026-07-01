
-- ============================================================
-- GENESIS V12 — Finance Intelligence Platform
-- ============================================================

-- 1) Expense categories --------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  vat_default_pct NUMERIC(5,2),
  is_recoverable BOOLEAN NOT NULL DEFAULT true,
  color TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_expense_categories TO authenticated;
GRANT ALL ON public.finance_expense_categories TO service_role;
ALTER TABLE public.finance_expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_cat_admin_write" ON public.finance_expense_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_cat_read" ON public.finance_expense_categories
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 2) Connector registry --------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  connection_method TEXT NOT NULL CHECK (connection_method IN ('api','oauth','manual','semi')),
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','connected','error','disabled','pending')),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  health_score INT NOT NULL DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  sync_frequency TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_slug)
);
GRANT SELECT ON public.finance_connectors TO authenticated;
GRANT ALL ON public.finance_connectors TO service_role;
ALTER TABLE public.finance_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_conn_admin_write" ON public.finance_connectors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_conn_read" ON public.finance_connectors
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 3) Subscriptions -------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('monthly','annual','quarterly','weekly','usage')),
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  vat_pct NUMERIC(5,2),
  started_at DATE,
  renews_at DATE,
  cancelled_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  price_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_subscriptions TO authenticated;
GRANT ALL ON public.finance_subscriptions TO service_role;
ALTER TABLE public.finance_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_sub_admin_write" ON public.finance_subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_sub_read" ON public.finance_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 4) VAT summaries -------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_vat_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL CHECK (period_type IN ('quarter','year')),
  period_year INT NOT NULL,
  period_number INT,
  vat_total_minor BIGINT NOT NULL DEFAULT 0,
  recoverable_minor BIGINT NOT NULL DEFAULT 0,
  non_recoverable_minor BIGINT NOT NULL DEFAULT 0,
  reclaimed_minor BIGINT NOT NULL DEFAULT 0,
  outstanding_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  invoice_count INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_year, period_number)
);
GRANT SELECT ON public.finance_vat_summaries TO authenticated;
GRANT ALL ON public.finance_vat_summaries TO service_role;
ALTER TABLE public.finance_vat_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_vat_admin_write" ON public.finance_vat_summaries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_vat_read" ON public.finance_vat_summaries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 5) Credit ledger -------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  credits_delta NUMERIC(18,4) NOT NULL DEFAULT 0,
  cost_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit TEXT,
  reference TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_credit_ledger TO authenticated;
GRANT ALL ON public.finance_credit_ledger TO service_role;
ALTER TABLE public.finance_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_credit_admin_write" ON public.finance_credit_ledger
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_credit_read" ON public.finance_credit_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 6) Alerts --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  alert_type TEXT NOT NULL,
  supplier_slug TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  action_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_alerts TO authenticated;
GRANT ALL ON public.finance_alerts TO service_role;
ALTER TABLE public.finance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_alerts_admin_write" ON public.finance_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_alerts_read" ON public.finance_alerts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 7) Manual-import tasks -------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_import_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_slug TEXT NOT NULL,
  period_label TEXT NOT NULL,
  expected_type TEXT NOT NULL DEFAULT 'invoice',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','uploaded','processed','skipped','failed')),
  instructions TEXT,
  expected_amount_minor BIGINT,
  currency TEXT,
  evidence_document_id UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  due_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_import_tasks TO authenticated;
GRANT ALL ON public.finance_import_tasks TO service_role;
ALTER TABLE public.finance_import_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_tasks_admin_write" ON public.finance_import_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_tasks_read" ON public.finance_import_tasks
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- 8) Annual dossiers -----------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_annual_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INT NOT NULL UNIQUE,
  total_expenses_minor BIGINT NOT NULL DEFAULT 0,
  total_vat_minor BIGINT NOT NULL DEFAULT 0,
  invoice_count INT NOT NULL DEFAULT 0,
  supplier_count INT NOT NULL DEFAULT 0,
  completeness_score INT NOT NULL DEFAULT 0,
  belastingdienst_ready BOOLEAN NOT NULL DEFAULT false,
  storage_path TEXT,
  manifest_sha256 TEXT,
  generated_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_annual_dossiers TO authenticated;
GRANT ALL ON public.finance_annual_dossiers TO service_role;
ALTER TABLE public.finance_annual_dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_dossier_admin_write" ON public.finance_annual_dossiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance_dossier_read" ON public.finance_annual_dossiers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'auditor')
  );

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO public.finance_expense_categories (slug, name, description, vat_default_pct, is_recoverable, color, sort_order) VALUES
  ('software','Software','SaaS subscriptions and licences',21,true,'#6366f1',10),
  ('hosting','Hosting','Application/server hosting',21,true,'#0ea5e9',20),
  ('domains','Domains','Domain names and DNS',21,true,'#14b8a6',30),
  ('marketing','Marketing','General marketing spend',21,true,'#f59e0b',40),
  ('advertising','Advertising','Paid ads (Meta, Google, Pinterest, TikTok)',21,true,'#ef4444',50),
  ('ai','AI','LLM, image, audio, video AI services',21,true,'#a855f7',60),
  ('development','Development','Dev tools and platforms',21,true,'#8b5cf6',70),
  ('subscriptions','Subscriptions','Other recurring subscriptions',21,true,'#ec4899',80),
  ('operations','Operations','Day-to-day operational costs',21,true,'#64748b',90),
  ('cloud','Cloud','Cloud infrastructure',21,true,'#0284c7',100),
  ('infrastructure','Infrastructure','Networking / CDN / edge',21,true,'#0891b2',110),
  ('shipping','Shipping','Fulfilment and logistics',0,false,'#f97316',120),
  ('commerce','Commerce','E-commerce platform fees',21,true,'#22c55e',130),
  ('tax','Tax','Tax payments (non-recoverable)',0,false,'#dc2626',140),
  ('legal','Legal','Legal and compliance',21,true,'#7c3aed',150),
  ('misc','Miscellaneous','Uncategorised expenses',21,true,'#9ca3af',999)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.finance_connectors (supplier_slug, display_name, connection_method, status, capabilities, health_score, sync_frequency, notes) VALUES
  ('stripe','Stripe','api','not_configured','{"billing":true,"invoices":true,"payments":true,"usage":true}'::jsonb,0,'daily','Live payment provider. Use Stripe API to pull invoices & receipts.'),
  ('lovable','Lovable','manual','not_configured','{"billing":true,"invoices":true,"credits":true}'::jsonb,0,'monthly','No public billing API — monthly manual upload from Lovable dashboard.'),
  ('supabase','Supabase','manual','not_configured','{"billing":true,"invoices":true,"usage":true}'::jsonb,0,'monthly','Monthly invoice download from Supabase dashboard.'),
  ('openai','OpenAI','api','not_configured','{"billing":true,"invoices":true,"usage":true,"credits":true}'::jsonb,0,'weekly','Usage via OpenAI API; invoices via billing portal.'),
  ('anthropic','Anthropic','manual','not_configured','{"billing":true,"invoices":true,"credits":true}'::jsonb,0,'monthly','Console-based invoice download.'),
  ('google','Google','manual','not_configured','{"billing":true,"invoices":true}'::jsonb,0,'monthly','Google Workspace / Cloud / Ads invoices via Payments Center.'),
  ('vercel','Vercel','manual','not_configured','{"billing":true,"invoices":true}'::jsonb,0,'monthly','Manual monthly invoice download.'),
  ('cloudflare','Cloudflare','manual','not_configured','{"billing":true,"invoices":true}'::jsonb,0,'monthly','Manual invoice download from dashboard.'),
  ('github','GitHub','manual','not_configured','{"billing":true,"invoices":true}'::jsonb,0,'monthly','Manual invoice download from billing settings.'),
  ('apple','Apple','manual','not_configured','{"billing":true,"invoices":true}'::jsonb,0,'monthly','App Store / developer receipts.'),
  ('meta','Meta','manual','not_configured','{"advertising":true,"invoices":true}'::jsonb,0,'monthly','Ads invoices via Meta Business Manager.'),
  ('pinterest','Pinterest','manual','not_configured','{"advertising":true,"invoices":true}'::jsonb,0,'monthly','Ads billing via Pinterest Ads Manager.'),
  ('tiktok','TikTok','manual','not_configured','{"advertising":true,"invoices":true}'::jsonb,0,'monthly','Ads billing via TikTok Ads Manager.'),
  ('cj-dropshipping','CJ Dropshipping','manual','not_configured','{"invoices":true,"shipping":true}'::jsonb,0,'weekly','Order invoices from CJ portal.'),
  ('domain-registrar','Domain Registrar','manual','not_configured','{"invoices":true}'::jsonb,0,'annual','Manual annual invoice archive.')
ON CONFLICT (supplier_slug) DO NOTHING;

INSERT INTO public.finance_annual_dossiers (fiscal_year, completeness_score, belastingdienst_ready)
VALUES (2025, 0, false), (2026, 0, false)
ON CONFLICT (fiscal_year) DO NOTHING;
