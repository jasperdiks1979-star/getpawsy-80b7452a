
-- GAEE: Genesis Autonomous Evolution Engine
CREATE TABLE IF NOT EXISTS public.gaee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_settings TO service_role;
ALTER TABLE public.gaee_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_gaee_settings" ON public.gaee_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger text,
  summary jsonb DEFAULT '{}'::jsonb,
  error text
);
GRANT ALL ON public.gaee_runs TO service_role;
ALTER TABLE public.gaee_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_gaee_runs" ON public.gaee_runs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.gaee_runs(id) ON DELETE CASCADE,
  source text NOT NULL,
  subject text NOT NULL,
  metric text,
  value numeric,
  payload jsonb DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_observations TO service_role;
ALTER TABLE public.gaee_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_gaee_observations" ON public.gaee_observations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.gaee_runs(id) ON DELETE SET NULL,
  domain text NOT NULL,
  target text NOT NULL,
  title text NOT NULL,
  rationale text,
  change_type text NOT NULL,
  proposed_change jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_value numeric DEFAULT 0,
  expected_roi numeric DEFAULT 0,
  expected_learning numeric DEFAULT 0,
  complexity_delta numeric DEFAULT 0,
  risk numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  strategic_alignment numeric DEFAULT 0,
  time_horizon_days integer DEFAULT 30,
  evolution_score numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'proposed',
  reviewer text,
  reviewed_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_proposals TO service_role;
ALTER TABLE public.gaee_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_gaee_proposals" ON public.gaee_proposals FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_gaee_proposals_status ON public.gaee_proposals(status, evolution_score DESC);

CREATE TABLE IF NOT EXISTS public.gaee_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.gaee_proposals(id) ON DELETE CASCADE,
  revenue_impact numeric,
  profit_impact numeric,
  csat_impact numeric,
  ops_cost_impact numeric,
  eng_cost_impact numeric,
  ai_credit_impact numeric,
  risk_score numeric,
  expected_learning numeric,
  assumptions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_simulations TO service_role;
ALTER TABLE public.gaee_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_gaee_simulations" ON public.gaee_simulations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.gaee_proposals(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'canary',
  traffic_pct numeric DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  metrics jsonb DEFAULT '{}'::jsonb,
  rollback_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_rollouts TO service_role;
ALTER TABLE public.gaee_rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_gaee_rollouts" ON public.gaee_rollouts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.gaee_proposals(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  actual_revenue_delta numeric,
  actual_profit_delta numeric,
  actual_risk numeric,
  prediction_error numeric,
  learning_notes text,
  payload jsonb DEFAULT '{}'::jsonb
);
GRANT ALL ON public.gaee_results TO service_role;
ALTER TABLE public.gaee_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_gaee_results" ON public.gaee_results FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_genesis_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.gaee_proposals(id) ON DELETE SET NULL,
  layer text NOT NULL,
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_genesis_updates TO service_role;
ALTER TABLE public.gaee_genesis_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_gaee_genesis_updates" ON public.gaee_genesis_updates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  keep jsonb DEFAULT '[]'::jsonb,
  remove jsonb DEFAULT '[]'::jsonb,
  merge jsonb DEFAULT '[]'::jsonb,
  redesign jsonb DEFAULT '[]'::jsonb,
  obsolete jsonb DEFAULT '[]'::jsonb,
  no_value jsonb DEFAULT '[]'::jsonb,
  narrative text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period)
);
GRANT ALL ON public.gaee_reflections TO service_role;
ALTER TABLE public.gaee_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_gaee_reflections" ON public.gaee_reflections FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_competitive_threats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threat text NOT NULL,
  category text,
  likelihood numeric DEFAULT 0,
  impact numeric DEFAULT 0,
  mitigation text,
  moat_action text,
  status text DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_competitive_threats TO service_role;
ALTER TABLE public.gaee_competitive_threats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_gaee_threats" ON public.gaee_competitive_threats FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gaee_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL UNIQUE,
  enterprise_value numeric,
  profit numeric,
  customer_trust numeric,
  clv numeric,
  brand_strength numeric,
  automation numeric,
  learning_rate numeric,
  execution_speed numeric,
  prediction_accuracy numeric,
  maintainability numeric,
  simplicity numeric,
  developer_productivity numeric,
  overall numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gaee_scorecards TO service_role;
ALTER TABLE public.gaee_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_gaee_scorecards" ON public.gaee_scorecards FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

INSERT INTO public.gaee_settings (key, value) VALUES
  ('cycle_config', '{"observe_interval_hours":6,"reflection_cron":"monthly","autopilot":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
