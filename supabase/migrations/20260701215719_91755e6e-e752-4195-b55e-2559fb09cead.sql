
CREATE TABLE IF NOT EXISTS public.ceo_business_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_key TEXT NOT NULL UNIQUE,
  score_name TEXT NOT NULL,
  score_value INT NOT NULL DEFAULT 0,
  score_grade TEXT,
  reason TEXT,
  source_module TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ceo_business_health TO authenticated;
GRANT ALL ON public.ceo_business_health TO service_role;
ALTER TABLE public.ceo_business_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cbh_admin" ON public.ceo_business_health FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cbh_read" ON public.ceo_business_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

CREATE TABLE IF NOT EXISTS public.ceo_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','high','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  source_module TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','resolved','dismissed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ceo_alerts TO authenticated;
GRANT ALL ON public.ceo_alerts TO service_role;
ALTER TABLE public.ceo_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cal_admin" ON public.ceo_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.ceo_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_key TEXT NOT NULL UNIQUE,
  goal_name TEXT NOT NULL,
  goal_category TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'count',
  due_at DATE,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ceo_goals TO authenticated;
GRANT ALL ON public.ceo_goals TO service_role;
ALTER TABLE public.ceo_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cg_admin" ON public.ceo_goals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.ceo_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_type TEXT NOT NULL CHECK (briefing_type IN ('morning','evening','weekly','monthly','quarterly','annual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  headline TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_path TEXT,
  sha256 TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ceo_briefings TO authenticated;
GRANT ALL ON public.ceo_briefings TO service_role;
ALTER TABLE public.ceo_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cb_admin" ON public.ceo_briefings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cb_read" ON public.ceo_briefings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'auditor'));

CREATE TABLE IF NOT EXISTS public.ceo_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  problem TEXT,
  evidence TEXT,
  recommended_action TEXT,
  confidence INT NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 0 AND 100),
  impact TEXT NOT NULL DEFAULT 'medium' CHECK (impact IN ('low','medium','high','critical')),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('low','medium','high')),
  estimated_roi TEXT,
  source_module TEXT,
  rank INT NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'open',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ceo_priorities TO authenticated;
GRANT ALL ON public.ceo_priorities TO service_role;
ALTER TABLE public.ceo_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_admin" ON public.ceo_priorities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.ceo_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date)
);
GRANT SELECT ON public.ceo_kpi_snapshots TO authenticated;
GRANT ALL ON public.ceo_kpi_snapshots TO service_role;
ALTER TABLE public.ceo_kpi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cks_admin" ON public.ceo_kpi_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed 16 business-health scores (linked to source modules)
INSERT INTO public.ceo_business_health (score_key, score_name, score_value, score_grade, reason, source_module) VALUES
  ('overall','Overall Business Health',72,'B','Weighted mean of 15 subscores across Genesis modules.','GENESIS V13'),
  ('revenue','Revenue Health',85,'A','Stripe LIVE reconciled; 4 orders / $218.98 all-time.','Revenue Intelligence'),
  ('marketing','Marketing Health',65,'B','Pinterest recovering; other channels underweighted.','Marketing Center'),
  ('traffic','Traffic Health',60,'B','Organic + Pinterest active; TikTok attribution restored.','Traffic Command'),
  ('conversion','Conversion Health',45,'C','PDP → ATC drop-off flagged by V7 War Room.','Conversion War Room'),
  ('products','Product Health',80,'A','445 products rescored by V2.1; Creative Readiness live.','Product Intelligence'),
  ('finance','Financial Health',60,'B','Baseline live; invoice imports pending (V12.1).','Finance Intelligence'),
  ('tax','Tax Readiness',40,'C','Reverse-charge + VAT rollups scaffolded; no imports yet.','Tax Intelligence'),
  ('infrastructure','Infrastructure Health',90,'A','98/100 by V10.2 certification.','Infra Health'),
  ('automation','Automation Health',65,'B','Manual imports still required for 6 suppliers.','Automation Status'),
  ('ai','AI Health',80,'A','Lovable Gateway + fallbacks stable.','AI Command'),
  ('analytics','Analytics Health',87,'A','Canonical GA4 (G-5WYL8RJDZF) unified; 87% human traffic.','Analytics Truth'),
  ('pinterest','Pinterest Health',75,'B','Guardian gate + PAIP v1 active; publishing restored.','Pinterest Intelligence'),
  ('stripe','Stripe Health',98,'A','100% LIVE by V10.2 / V10.3.','Stripe Intelligence'),
  ('compliance','Compliance Health',70,'B','RLS + role model + merchant-safe layer active.','Compliance'),
  ('evidence','Evidence Integrity',100,'A','Evidence Vault SHA-256 chain fully operational.','Evidence Vault')
ON CONFLICT (score_key) DO NOTHING;

-- Seed initial goals
INSERT INTO public.ceo_goals (goal_key, goal_name, goal_category, target_value, current_value, unit) VALUES
  ('sales_100','First 100 sales','sales',100,4,'orders'),
  ('sales_1000','First 1,000 sales','sales',1000,4,'orders'),
  ('visitors_10k','10,000 monthly visitors','traffic',10000,0,'visitors'),
  ('visitors_100k','100,000 monthly visitors','traffic',100000,0,'visitors'),
  ('rev_1k','First $1,000 revenue','revenue',1000,218.98,'usd'),
  ('rev_10k','First $10,000 revenue','revenue',10000,218.98,'usd'),
  ('breakeven','Monthly break-even','profit',1,0,'months')
ON CONFLICT (goal_key) DO NOTHING;

-- Seed executive priorities (drawn from actual open issues across Genesis)
INSERT INTO public.ceo_priorities (title, problem, evidence, recommended_action, confidence, impact, difficulty, estimated_roi, source_module, rank)
SELECT * FROM (VALUES
  ('Recover PDP → ATC drop-off','97.8% drop between PDP view and Add-to-Cart.','V7 Conversion War Room — /admin/pdp-atc-drilldown','Ship ATC-copy + trust-badge experiment on top 20 SKUs.',90,'critical','medium','+30–60% revenue if halved',
   'Conversion War Room',10),
  ('Import backlog invoices','Missing Lovable, Supabase, Vercel, OpenAI invoices for FY26.','V12.1 finance_actions — 8 open tasks','Complete manual invoice archive in Evidence Vault this week.',95,'high','low','Unlocks VAT recovery + Tax score',
   'Finance Intelligence',20),
  ('Complete Pinterest recovery','Publishing paused pending PAIP/PQIF full ramp.','Pinterest Health page','Ramp autopilot to conservative daily cap.',80,'high','medium','Traffic +25%','Pinterest Intelligence',30),
  ('Wire briefing cron','No automated morning/evening briefings yet.','ceo_briefings empty','Schedule daily briefing generation.',85,'medium','low','Executive time savings','GENESIS V13',40)
) AS v(title,problem,evidence,recommended_action,confidence,impact,difficulty,estimated_roi,source_module,rank)
WHERE NOT EXISTS (SELECT 1 FROM public.ceo_priorities LIMIT 1);
