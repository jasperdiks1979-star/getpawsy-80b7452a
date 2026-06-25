
-- ============================================================
-- Wave 6 — Autonomous Commander AI (Stage 6A)
-- ============================================================

-- 1) Settings (singleton)
CREATE TABLE public.cmdr_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kill_switch boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'simulation',
  autonomy_level int NOT NULL DEFAULT 1,
  default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  daily_ai_budget_cents int NOT NULL DEFAULT 500,
  daily_cloud_budget_cents int NOT NULL DEFAULT 500,
  daily_pinterest_budget_cents int NOT NULL DEFAULT 0,
  daily_ads_budget_cents int NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cmdr_settings TO authenticated;
GRANT ALL ON public.cmdr_settings TO service_role;
ALTER TABLE public.cmdr_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_settings_admin_read" ON public.cmdr_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_settings_service" ON public.cmdr_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.cmdr_settings (mode, autonomy_level) VALUES ('simulation', 1);

-- 2) Goals
CREATE TABLE public.cmdr_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  metric text NOT NULL,
  target_value numeric,
  horizon text NOT NULL DEFAULT '30d',
  weight numeric NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cmdr_goals TO authenticated;
GRANT ALL ON public.cmdr_goals TO service_role;
ALTER TABLE public.cmdr_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_goals_admin_read" ON public.cmdr_goals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_goals_service" ON public.cmdr_goals FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.cmdr_goals (name, metric, target_value, horizon, weight) VALUES
  ('Increase revenue 30%', 'revenue_growth_pct', 30, '90d', 1.0),
  ('Maximize ROI', 'roi', 3.0, '30d', 0.9),
  ('Reduce AI cost', 'ai_cost_reduction_pct', 20, '30d', 0.6),
  ('Increase Pinterest CTR', 'pinterest_ctr', 1.5, '30d', 0.8);

-- 3) Runs & steps
CREATE TABLE public.cmdr_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',
  mode text NOT NULL DEFAULT 'simulation',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.cmdr_runs TO authenticated;
GRANT ALL ON public.cmdr_runs TO service_role;
ALTER TABLE public.cmdr_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_runs_admin_read" ON public.cmdr_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_runs_service" ON public.cmdr_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.cmdr_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.cmdr_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.cmdr_run_steps TO authenticated;
GRANT ALL ON public.cmdr_run_steps TO service_role;
ALTER TABLE public.cmdr_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_run_steps_admin_read" ON public.cmdr_run_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_run_steps_service" ON public.cmdr_run_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Decisions
CREATE TABLE public.cmdr_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.cmdr_runs(id) ON DELETE SET NULL,
  target_engine text NOT NULL,
  action text NOT NULL,
  reasoning text,
  confidence numeric DEFAULT 0,
  expected_roi numeric DEFAULT 0,
  estimated_cost_cents int DEFAULT 0,
  priority int DEFAULT 50,
  status text NOT NULL DEFAULT 'pending',
  execution_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
GRANT SELECT ON public.cmdr_decisions TO authenticated;
GRANT ALL ON public.cmdr_decisions TO service_role;
ALTER TABLE public.cmdr_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_decisions_admin_read" ON public.cmdr_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_decisions_service" ON public.cmdr_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Resource plan
CREATE TABLE public.cmdr_resource_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.cmdr_runs(id) ON DELETE SET NULL,
  plan_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  engine text NOT NULL,
  scheduled_for timestamptz,
  expected_calls int DEFAULT 0,
  expected_cost_cents int DEFAULT 0,
  priority int DEFAULT 50,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cmdr_resource_plan TO authenticated;
GRANT ALL ON public.cmdr_resource_plan TO service_role;
ALTER TABLE public.cmdr_resource_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_resource_plan_admin_read" ON public.cmdr_resource_plan FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_resource_plan_service" ON public.cmdr_resource_plan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) Model routing
CREATE TABLE public.cmdr_model_route_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.cmdr_runs(id) ON DELETE SET NULL,
  task text NOT NULL,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_model text NOT NULL,
  reason text,
  latency_ms int,
  cost_cents int DEFAULT 0,
  success boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cmdr_model_route_log TO authenticated;
GRANT ALL ON public.cmdr_model_route_log TO service_role;
ALTER TABLE public.cmdr_model_route_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_model_route_admin_read" ON public.cmdr_model_route_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_model_route_service" ON public.cmdr_model_route_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7) Budget ledger
CREATE TABLE public.cmdr_budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  period_start timestamptz NOT NULL,
  category text NOT NULL,
  budget_cents int DEFAULT 0,
  spent_cents int DEFAULT 0,
  remaining_cents int DEFAULT 0,
  breached boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cmdr_budget_ledger_period_idx ON public.cmdr_budget_ledger (period, period_start, category);
GRANT SELECT ON public.cmdr_budget_ledger TO authenticated;
GRANT ALL ON public.cmdr_budget_ledger TO service_role;
ALTER TABLE public.cmdr_budget_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_budget_admin_read" ON public.cmdr_budget_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_budget_service" ON public.cmdr_budget_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8) Health signals
CREATE TABLE public.cmdr_health_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_run_at timestamptz,
  lag_seconds int,
  error_rate numeric DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cmdr_health_engine_idx ON public.cmdr_health_signals (engine, observed_at DESC);
GRANT SELECT ON public.cmdr_health_signals TO authenticated;
GRANT ALL ON public.cmdr_health_signals TO service_role;
ALTER TABLE public.cmdr_health_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_health_admin_read" ON public.cmdr_health_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_health_service" ON public.cmdr_health_signals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9) Simulations
CREATE TABLE public.cmdr_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES public.cmdr_decisions(id) ON DELETE CASCADE,
  expected_roi numeric DEFAULT 0,
  expected_clicks int DEFAULT 0,
  expected_revenue_cents int DEFAULT 0,
  expected_conversions int DEFAULT 0,
  expected_ai_cost_cents int DEFAULT 0,
  expected_cloud_cost_cents int DEFAULT 0,
  threshold numeric DEFAULT 1.0,
  passed boolean DEFAULT false,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cmdr_simulations TO authenticated;
GRANT ALL ON public.cmdr_simulations TO service_role;
ALTER TABLE public.cmdr_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_sim_admin_read" ON public.cmdr_simulations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_sim_service" ON public.cmdr_simulations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10) Memory
CREATE TABLE public.cmdr_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  outcome text NOT NULL,
  score numeric DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cmdr_memory_entity_idx ON public.cmdr_memory (entity_type, entity_key, occurred_at DESC);
GRANT SELECT ON public.cmdr_memory TO authenticated;
GRANT ALL ON public.cmdr_memory TO service_role;
ALTER TABLE public.cmdr_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_memory_admin_read" ON public.cmdr_memory FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_memory_service" ON public.cmdr_memory FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11) Audit log
CREATE TABLE public.cmdr_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL DEFAULT 'commander',
  action text NOT NULL,
  target text,
  reasoning text,
  confidence numeric,
  expected_roi numeric,
  estimated_cost_cents int,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cmdr_audit_created_idx ON public.cmdr_audit_log (created_at DESC);
GRANT SELECT ON public.cmdr_audit_log TO authenticated;
GRANT ALL ON public.cmdr_audit_log TO service_role;
ALTER TABLE public.cmdr_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmdr_audit_admin_read" ON public.cmdr_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cmdr_audit_service" ON public.cmdr_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
