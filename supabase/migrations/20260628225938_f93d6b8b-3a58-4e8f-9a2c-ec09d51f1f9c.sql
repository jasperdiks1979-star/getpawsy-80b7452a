
CREATE OR REPLACE FUNCTION public.spe_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.spe_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL, description text,
  horizon text NOT NULL,
  parent_id uuid REFERENCES public.spe_objectives(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'objective',
  owner text, priority numeric NOT NULL DEFAULT 0.5,
  expected_value_usd numeric, confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'active',
  metric text, target_value numeric, current_value numeric,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_objectives TO authenticated;
GRANT ALL ON public.spe_objectives TO service_role;
ALTER TABLE public.spe_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_obj admin read" ON public.spe_objectives FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_obj service write" ON public.spe_objectives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_spe_obj_touch BEFORE UPDATE ON public.spe_objectives FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text,
  objective_id uuid REFERENCES public.spe_objectives(id) ON DELETE SET NULL,
  horizon text NOT NULL DEFAULT '90d',
  status text NOT NULL DEFAULT 'proposed',
  business_value numeric, cost_usd numeric, risk numeric,
  roi numeric, expected_learning text,
  expected_revenue_usd numeric, expected_profit_usd numeric,
  priority numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  effort_weeks numeric, owner text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_initiatives TO authenticated;
GRANT ALL ON public.spe_initiatives TO service_role;
ALTER TABLE public.spe_initiatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_in admin read" ON public.spe_initiatives FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_in service write" ON public.spe_initiatives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_spe_in_status ON public.spe_initiatives(status, priority DESC);
CREATE TRIGGER trg_spe_in_touch BEFORE UPDATE ON public.spe_initiatives FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_roadmap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  initiative_id uuid REFERENCES public.spe_initiatives(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  start_date date, target_date date, completed_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_roadmap TO authenticated;
GRANT ALL ON public.spe_roadmap TO service_role;
ALTER TABLE public.spe_roadmap ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_rm admin read" ON public.spe_roadmap FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_rm service write" ON public.spe_roadmap FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_spe_rm_touch BEFORE UPDATE ON public.spe_roadmap FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL UNIQUE,
  capacity_units numeric, used_units numeric,
  unit_label text, allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_resources TO authenticated;
GRANT ALL ON public.spe_resources TO service_role;
ALTER TABLE public.spe_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_res admin read" ON public.spe_resources FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_res service write" ON public.spe_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_spe_res_touch BEFORE UPDATE ON public.spe_resources FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_kind text NOT NULL, from_id uuid NOT NULL,
  to_kind text NOT NULL, to_id uuid NOT NULL,
  relation text NOT NULL DEFAULT 'depends_on',
  blocker boolean NOT NULL DEFAULT false,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_kind, from_id, to_kind, to_id, relation)
);
GRANT SELECT ON public.spe_dependencies TO authenticated;
GRANT ALL ON public.spe_dependencies TO service_role;
ALTER TABLE public.spe_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_dep admin read" ON public.spe_dependencies FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_dep service write" ON public.spe_dependencies FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.spe_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, category text,
  probability numeric NOT NULL DEFAULT 0.3,
  impact_usd numeric, severity numeric NOT NULL DEFAULT 0.5,
  mitigation text, monitoring text, owner text,
  status text NOT NULL DEFAULT 'open',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_risks TO authenticated;
GRANT ALL ON public.spe_risks TO service_role;
ALTER TABLE public.spe_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_rk admin read" ON public.spe_risks FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_rk service write" ON public.spe_risks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_spe_rk_touch BEFORE UPDATE ON public.spe_risks FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL,
  horizon text NOT NULL DEFAULT '90d',
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_revenue_usd numeric, expected_profit_usd numeric,
  expected_risk numeric, strategic_response text,
  confidence numeric NOT NULL DEFAULT 0.5,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_scenarios TO authenticated;
GRANT ALL ON public.spe_scenarios TO service_role;
ALTER TABLE public.spe_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_sc admin read" ON public.spe_scenarios FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_sc service write" ON public.spe_scenarios FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.spe_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text NOT NULL UNIQUE,
  domain text, current_level numeric NOT NULL DEFAULT 0.5,
  target_level numeric NOT NULL DEFAULT 0.8,
  gap_notes text, owner text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_capabilities TO authenticated;
GRANT ALL ON public.spe_capabilities TO service_role;
ALTER TABLE public.spe_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_ca admin read" ON public.spe_capabilities FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_ca service write" ON public.spe_capabilities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_spe_ca_touch BEFORE UPDATE ON public.spe_capabilities FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_maturity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  score numeric NOT NULL DEFAULT 0.5,
  weakest_area text, evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_maturity TO authenticated;
GRANT ALL ON public.spe_maturity TO service_role;
ALTER TABLE public.spe_maturity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_mt admin read" ON public.spe_maturity FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_mt service write" ON public.spe_maturity FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_spe_mt_touch BEFORE UPDATE ON public.spe_maturity FOR EACH ROW EXECUTE FUNCTION public.spe_touch_updated_at();

CREATE TABLE public.spe_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence text NOT NULL,
  period_start date, period_end date,
  summary text NOT NULL,
  achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  forecasts jsonb NOT NULL DEFAULT '[]'::jsonb,
  priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_investments jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_experiments jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_pauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_briefings TO authenticated;
GRANT ALL ON public.spe_briefings TO service_role;
ALTER TABLE public.spe_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_br admin read" ON public.spe_briefings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_br service write" ON public.spe_briefings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_spe_br_cadence ON public.spe_briefings(cadence, created_at DESC);

CREATE TABLE public.spe_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid REFERENCES public.spe_objectives(id) ON DELETE CASCADE,
  horizon text NOT NULL,
  target_date date NOT NULL,
  forecast numeric NOT NULL,
  ci_low numeric, ci_high numeric,
  method text, confidence numeric NOT NULL DEFAULT 0.5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_forecasts TO authenticated;
GRANT ALL ON public.spe_forecasts TO service_role;
ALTER TABLE public.spe_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_fc admin read" ON public.spe_forecasts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_fc service write" ON public.spe_forecasts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.spe_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL, amount_usd numeric NOT NULL,
  rationale text, expected_return_usd numeric,
  expected_payback_days numeric, risk numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'recommended',
  approved_by text, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_investments TO authenticated;
GRANT ALL ON public.spe_investments TO service_role;
ALTER TABLE public.spe_investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_iv admin read" ON public.spe_investments FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_iv service write" ON public.spe_investments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.spe_evolution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL, entity_kind text, entity_id uuid,
  before_state jsonb, after_state jsonb,
  rationale text, confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_evolution_log TO authenticated;
GRANT ALL ON public.spe_evolution_log TO service_role;
ALTER TABLE public.spe_evolution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_ev admin read" ON public.spe_evolution_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_ev service write" ON public.spe_evolution_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.spe_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL, action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_consultations TO authenticated;
GRANT ALL ON public.spe_consultations TO service_role;
ALTER TABLE public.spe_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_co admin read" ON public.spe_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_co service write" ON public.spe_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.spe_settings (
  key text PRIMARY KEY, value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spe_settings TO authenticated;
GRANT ALL ON public.spe_settings TO service_role;
ALTER TABLE public.spe_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spe_set admin read" ON public.spe_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "spe_set service write" ON public.spe_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.spe_settings(key,value) VALUES
  ('horizons', '["24h","7d","30d","90d","1y","3y"]'::jsonb),
  ('domains', '["strategy","marketing","pinterest","creative","analytics","revenue","automation","governance","knowledge","experimentation","planning"]'::jsonb),
  ('mission', '"Make GetPawsy the most-loved US pet brand by combining autonomous AI, premium creatives, and trusted commerce."'::jsonb)
ON CONFLICT (key) DO NOTHING;
