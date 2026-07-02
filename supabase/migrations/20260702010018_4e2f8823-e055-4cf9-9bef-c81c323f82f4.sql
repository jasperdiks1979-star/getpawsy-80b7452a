-- GENESIS Ω∞.1 — Perpetual Company

CREATE TABLE IF NOT EXISTS public.genesis_perpetual_principles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pillar TEXT,
  immutable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_perpetual_principles TO authenticated;
GRANT ALL ON public.genesis_perpetual_principles TO service_role;
ALTER TABLE public.genesis_perpetual_principles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "principles readable by admins" ON public.genesis_perpetual_principles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_perpetual_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_number BIGSERIAL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  observations JSONB NOT NULL DEFAULT '{}'::jsonb,
  understanding JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanations JSONB NOT NULL DEFAULT '{}'::jsonb,
  priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulations JSONB NOT NULL DEFAULT '[]'::jsonb,
  validations JSONB NOT NULL DEFAULT '[]'::jsonb,
  executions JSONB NOT NULL DEFAULT '[]'::jsonb,
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  learnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived JSONB NOT NULL DEFAULT '{}'::jsonb,
  improvements JSONB NOT NULL DEFAULT '[]'::jsonb,
  fingerprint_sha256 TEXT
);
GRANT SELECT ON public.genesis_perpetual_cycles TO authenticated;
GRANT ALL ON public.genesis_perpetual_cycles TO service_role;
ALTER TABLE public.genesis_perpetual_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cycles readable by admins" ON public.genesis_perpetual_cycles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_business_compass (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES public.genesis_perpetual_cycles(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL,
  revenue_impact NUMERIC,
  profit_impact NUMERIC,
  customer_value NUMERIC,
  customer_trust NUMERIC,
  operational_simplicity NUMERIC,
  technical_risk NUMERIC,
  financial_risk NUMERIC,
  legal_risk NUMERIC,
  maintenance_cost NUMERIC,
  expected_roi NUMERIC,
  confidence NUMERIC,
  rollback_plan TEXT,
  board_approval BOOLEAN,
  century_test_pass BOOLEAN,
  decision TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_business_compass TO authenticated;
GRANT ALL ON public.genesis_business_compass TO service_role;
ALTER TABLE public.genesis_business_compass ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compass readable by admins" ON public.genesis_business_compass
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_perpetual_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cycle_id UUID REFERENCES public.genesis_perpetual_cycles(id) ON DELETE SET NULL,
  business_sustainability NUMERIC,
  customer_sustainability NUMERIC,
  financial_sustainability NUMERIC,
  technical_sustainability NUMERIC,
  operational_sustainability NUMERIC,
  architectural_sustainability NUMERIC,
  knowledge_sustainability NUMERIC,
  executive_governance NUMERIC,
  long_term_readiness NUMERIC,
  century_readiness NUMERIC,
  overall_company_maturity NUMERIC,
  narrative TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint_sha256 TEXT NOT NULL
);
GRANT SELECT ON public.genesis_perpetual_certifications TO authenticated;
GRANT ALL ON public.genesis_perpetual_certifications TO service_role;
ALTER TABLE public.genesis_perpetual_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certifications readable by admins" ON public.genesis_perpetual_certifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.genesis_perpetual_principles (code, title, body, pillar) VALUES
  ('CORE.CUSTOMER_VALUE','Customer Value','Every decision must increase real customer value.','customer'),
  ('CORE.CUSTOMER_TRUST','Customer Trust','Trust is the cause of revenue. Protect it above all.','trust'),
  ('CORE.PROFITABILITY','Business Profitability','Optimize profit, not vanity metrics.','profit'),
  ('CORE.SIMPLICITY','Operational Simplicity','Prefer the simpler solution when outcomes match.','simplicity'),
  ('CORE.SUSTAINABILITY','Long-Term Sustainability','Reject short-term wins that create long-term damage.','sustainability'),
  ('LAW.100_YEAR','The 100-Year Test','Would this still be correct if GetPawsy exists in 100 years?','sustainability'),
  ('LAW.HUMAN','The Human Rule','Assist the owner. Never fabricate certainty. Say UNKNOWN.','governance'),
  ('LAW.BOARD','The Board Question','Would an experienced Board approve this with the available evidence?','governance'),
  ('LAW.LEGACY','The Legacy Rule','Leave the company healthier than we found it. Reduce entropy.','sustainability'),
  ('LAW.KNOWLEDGE','The Knowledge Rule','Nothing valuable may be forgotten. Archive everything.','knowledge')
ON CONFLICT (code) DO NOTHING;