
CREATE TABLE public.genesis_digital_executives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE,
  role_name text NOT NULL,
  responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  reports_to text NOT NULL DEFAULT 'OMEGA',
  status text NOT NULL DEFAULT 'active',
  readiness_score int NOT NULL DEFAULT 0,
  last_meeting_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_digital_executives TO authenticated;
GRANT ALL ON public.genesis_digital_executives TO service_role;
ALTER TABLE public.genesis_digital_executives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read execs" ON public.genesis_digital_executives FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service manage execs" ON public.genesis_digital_executives FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_board_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  agenda text,
  reports jsonb NOT NULL DEFAULT '[]'::jsonb,
  consensus jsonb NOT NULL DEFAULT '{}'::jsonb,
  disagreements jsonb NOT NULL DEFAULT '[]'::jsonb,
  north_star_alignment int NOT NULL DEFAULT 0,
  first_100_alignment int NOT NULL DEFAULT 0,
  constitution_compliance int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_board_meetings TO authenticated;
GRANT ALL ON public.genesis_board_meetings TO service_role;
ALTER TABLE public.genesis_board_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read meetings" ON public.genesis_board_meetings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service manage meetings" ON public.genesis_board_meetings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_executive_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.genesis_board_meetings(id) ON DELETE CASCADE,
  executive_role text NOT NULL,
  title text NOT NULL,
  rationale text,
  expected_revenue numeric DEFAULT 0,
  expected_profit numeric DEFAULT 0,
  customer_impact int DEFAULT 0,
  operational_impact int DEFAULT 0,
  risk int DEFAULT 0,
  confidence int DEFAULT 0,
  engineering_cost int DEFAULT 0,
  financial_cost numeric DEFAULT 0,
  strategic_value int DEFAULT 0,
  priority_score numeric DEFAULT 0,
  first_100_impact boolean DEFAULT false,
  constitution_compliant boolean DEFAULT true,
  status text NOT NULL DEFAULT 'proposed',
  evidence jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_executive_decisions TO authenticated;
GRANT ALL ON public.genesis_executive_decisions TO service_role;
ALTER TABLE public.genesis_executive_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read decisions" ON public.genesis_executive_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service manage decisions" ON public.genesis_executive_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_shareholder_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  headline text NOT NULL,
  body_markdown text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  major_decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  outlook text,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_shareholder_letters TO authenticated;
GRANT ALL ON public.genesis_shareholder_letters TO service_role;
ALTER TABLE public.genesis_shareholder_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read letters" ON public.genesis_shareholder_letters FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service manage letters" ON public.genesis_shareholder_letters FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_omega_infinity_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certified_at timestamptz NOT NULL DEFAULT now(),
  executive_readiness int NOT NULL DEFAULT 0,
  strategic_readiness int NOT NULL DEFAULT 0,
  operational_readiness int NOT NULL DEFAULT 0,
  financial_readiness int NOT NULL DEFAULT 0,
  tax_readiness int NOT NULL DEFAULT 0,
  architecture_readiness int NOT NULL DEFAULT 0,
  ai_readiness int NOT NULL DEFAULT 0,
  security_readiness int NOT NULL DEFAULT 0,
  customer_readiness int NOT NULL DEFAULT 0,
  growth_readiness int NOT NULL DEFAULT 0,
  company_intelligence_score int NOT NULL DEFAULT 0,
  business_maturity_score int NOT NULL DEFAULT 0,
  executive_governance_score int NOT NULL DEFAULT 0,
  overall_score int NOT NULL DEFAULT 0,
  fingerprint text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.genesis_omega_infinity_certifications TO authenticated;
GRANT ALL ON public.genesis_omega_infinity_certifications TO service_role;
ALTER TABLE public.genesis_omega_infinity_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read cert" ON public.genesis_omega_infinity_certifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service manage cert" ON public.genesis_omega_infinity_certifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed the 13 digital executives
INSERT INTO public.genesis_digital_executives (role_code, role_name, responsibilities, reports_to) VALUES
  ('CEO','Digital CEO','["strategy","revenue prioritization","growth roadmap","executive decisions","opportunity ranking","business health","forecasting"]'::jsonb,'OMEGA'),
  ('CFO','Digital CFO','["revenue","profit","cashflow","margins","subscriptions","invoices","VAT","corporate tax","budget","reporting","audit readiness"]'::jsonb,'CEO'),
  ('COO','Digital COO','["operations","automation","workflow","orders","inventory","fulfilment","customer journey","incident response"]'::jsonb,'CEO'),
  ('CTO','Digital CTO','["architecture","infrastructure","performance","security","deployments","databases","edge functions","tech debt","scalability"]'::jsonb,'CEO'),
  ('CMO','Digital CMO','["pinterest","seo","organic traffic","content","brand","email","campaigns","marketing roi","acquisition"]'::jsonb,'CEO'),
  ('CRO','Digital CRO','["landing pages","collections","product pages","checkout","funnels","heatmaps","session replay","ab testing","conversion"]'::jsonb,'CEO'),
  ('CCO','Digital CCO','["customer trust","satisfaction","returns","support","reviews","community","retention","ltv","nps"]'::jsonb,'CEO'),
  ('CISO','Digital CISO','["security","privacy","gdpr","backups","secrets","auth","compliance","risk"]'::jsonb,'CEO'),
  ('TAX','Digital Tax Officer','["vat","tax evidence","invoices","assets","depreciation","audit","government compliance","archives"]'::jsonb,'CFO'),
  ('LEGAL','Digital Legal Officer','["terms","privacy","cookies","consumer protection","regional compliance","platform compliance"]'::jsonb,'CEO'),
  ('AI','Digital AI Director','["ai costs","ai quality","prompt governance","credits","model performance","ai roi","hallucination detection","benchmarking"]'::jsonb,'CTO'),
  ('GENOME','Digital Genome','["system memory","architecture","dependencies","documentation","knowledge graph","version history"]'::jsonb,'OMEGA'),
  ('TWIN','Digital Twin','["live digital representation","connectivity","measurability","explainability"]'::jsonb,'OMEGA')
ON CONFLICT (role_code) DO NOTHING;
