
-- Phase 8 — Autonomous Growth Orchestrator: orchestration state only.
-- No analytics duplication; pure aggregator/learning state.

CREATE TABLE IF NOT EXISTS public.growth_orchestrator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'manual',
  collected_count int NOT NULL DEFAULT 0,
  deduped_count int NOT NULL DEFAULT 0,
  plans_count int NOT NULL DEFAULT 0,
  growth_score numeric,
  health_score numeric,
  validation_score numeric,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_orchestrator_runs TO authenticated;
GRANT ALL ON public.growth_orchestrator_runs TO service_role;
ALTER TABLE public.growth_orchestrator_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read orchestrator runs"
  ON public.growth_orchestrator_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages orchestrator runs"
  ON public.growth_orchestrator_runs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.growth_orchestrator_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.growth_orchestrator_runs(id) ON DELETE CASCADE,
  dedup_key text NOT NULL,
  source text NOT NULL,
  source_id text,
  title text NOT NULL,
  category text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  expected_impact text,
  effort text,
  risk text,
  est_traffic_gain numeric NOT NULL DEFAULT 0,
  est_revenue_gain numeric NOT NULL DEFAULT 0,
  est_time_to_value_hours numeric NOT NULL DEFAULT 24,
  historical_success numeric NOT NULL DEFAULT 0.5,
  score numeric NOT NULL DEFAULT 0,
  rank int,
  plan_id uuid,
  obsolete boolean NOT NULL DEFAULT false,
  conflicts_with uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, dedup_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_orchestrator_recommendations TO authenticated;
GRANT ALL ON public.growth_orchestrator_recommendations TO service_role;
ALTER TABLE public.growth_orchestrator_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read orchestrator recs"
  ON public.growth_orchestrator_recommendations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages orchestrator recs"
  ON public.growth_orchestrator_recommendations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_gorec_run ON public.growth_orchestrator_recommendations(run_id);
CREATE INDEX IF NOT EXISTS idx_gorec_rank ON public.growth_orchestrator_recommendations(run_id, rank);

CREATE TABLE IF NOT EXISTS public.growth_orchestrator_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.growth_orchestrator_runs(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  rec_ids uuid[] NOT NULL DEFAULT '{}',
  depends_on uuid[] NOT NULL DEFAULT '{}',
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_orchestrator_plans TO authenticated;
GRANT ALL ON public.growth_orchestrator_plans TO service_role;
ALTER TABLE public.growth_orchestrator_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read orchestrator plans"
  ON public.growth_orchestrator_plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages orchestrator plans"
  ON public.growth_orchestrator_plans FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.growth_orchestrator_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.growth_orchestrator_plans(id) ON DELETE CASCADE,
  rec_id uuid REFERENCES public.growth_orchestrator_recommendations(id) ON DELETE CASCADE,
  simulated_at timestamptz NOT NULL DEFAULT now(),
  estimated_traffic_uplift numeric NOT NULL DEFAULT 0,
  estimated_revenue_uplift numeric NOT NULL DEFAULT 0,
  estimated_conversion_uplift numeric NOT NULL DEFAULT 0,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_dashboards text[] NOT NULL DEFAULT '{}',
  affected_analytics text[] NOT NULL DEFAULT '{}',
  affected_pinterest_metrics text[] NOT NULL DEFAULT '{}',
  rollback_complexity text NOT NULL DEFAULT 'low',
  estimated_impl_minutes int NOT NULL DEFAULT 30,
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_orchestrator_simulations TO authenticated;
GRANT ALL ON public.growth_orchestrator_simulations TO service_role;
ALTER TABLE public.growth_orchestrator_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read orchestrator sims"
  ON public.growth_orchestrator_simulations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages orchestrator sims"
  ON public.growth_orchestrator_simulations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.growth_orchestrator_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_id uuid REFERENCES public.growth_orchestrator_recommendations(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.growth_orchestrator_plans(id) ON DELETE SET NULL,
  dedup_key text,
  source text,
  outcome text NOT NULL,
  traffic_delta numeric,
  conversion_delta numeric,
  pinterest_delta numeric,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_orchestrator_outcomes TO authenticated;
GRANT ALL ON public.growth_orchestrator_outcomes TO service_role;
ALTER TABLE public.growth_orchestrator_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage orchestrator outcomes"
  ON public.growth_orchestrator_outcomes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages orchestrator outcomes"
  ON public.growth_orchestrator_outcomes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_goout_key ON public.growth_orchestrator_outcomes(dedup_key);

CREATE TABLE IF NOT EXISTS public.growth_orchestrator_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  weight numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_orchestrator_weights TO authenticated;
GRANT ALL ON public.growth_orchestrator_weights TO service_role;
ALTER TABLE public.growth_orchestrator_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read orchestrator weights"
  ON public.growth_orchestrator_weights FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages orchestrator weights"
  ON public.growth_orchestrator_weights FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.growth_orchestrator_weights (key, weight) VALUES
  ('impact', 0.30),
  ('confidence', 0.20),
  ('risk_penalty', 0.15),
  ('cost_penalty', 0.10),
  ('traffic_gain', 0.10),
  ('conversion_gain', 0.10),
  ('history', 0.05)
ON CONFLICT (key) DO NOTHING;
