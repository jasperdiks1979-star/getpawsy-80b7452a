
-- Registry of AI engines under MIL governance
CREATE TABLE public.mil_ai_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'active',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_ai_registry TO authenticated;
GRANT ALL ON public.mil_ai_registry TO service_role;
ALTER TABLE public.mil_ai_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_ai_registry admin" ON public.mil_ai_registry FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Every AI decision with expected/actual
CREATE TABLE public.mil_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  decision_type text NOT NULL,
  subject text,
  reasoning text,
  confidence numeric,
  expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_outcome jsonb,
  delta jsonb,
  financial_impact_cents bigint,
  business_impact_score numeric,
  decided_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX mil_decisions_engine_idx ON public.mil_decisions(engine_key, decided_at DESC);
CREATE INDEX mil_decisions_status_idx ON public.mil_decisions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_decisions TO authenticated;
GRANT ALL ON public.mil_decisions TO service_role;
ALTER TABLE public.mil_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_decisions admin" ON public.mil_decisions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Weekly performance reviews
CREATE TABLE public.mil_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  decision_quality numeric,
  prediction_accuracy numeric,
  ctr_accuracy numeric,
  conversion_accuracy numeric,
  roas_accuracy numeric,
  profit_contribution_cents bigint,
  novelty_score numeric,
  business_value numeric,
  overall_grade numeric,
  letter_grade text,
  sample_size int,
  notes text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(engine_key, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_performance_reviews TO authenticated;
GRANT ALL ON public.mil_performance_reviews TO service_role;
ALTER TABLE public.mil_performance_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_perf_reviews admin" ON public.mil_performance_reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Confidence calibration
CREATE TABLE public.mil_confidence_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  bucket_low numeric NOT NULL,
  bucket_high numeric NOT NULL,
  predicted_avg numeric,
  actual_success_rate numeric,
  sample_size int NOT NULL DEFAULT 0,
  calibration_error numeric,
  recommended_adjustment numeric,
  period_start date,
  period_end date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mil_calibration_engine_idx ON public.mil_confidence_calibration(engine_key, period_end DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_confidence_calibration TO authenticated;
GRANT ALL ON public.mil_confidence_calibration TO service_role;
ALTER TABLE public.mil_confidence_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_calib admin" ON public.mil_confidence_calibration FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Meta-experiments on AI behavior
CREATE TABLE public.mil_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  hypothesis text NOT NULL,
  parameter text NOT NULL,
  variant_a jsonb NOT NULL,
  variant_b jsonb NOT NULL,
  metric text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  started_at timestamptz,
  ended_at timestamptz,
  winner text,
  lift numeric,
  confidence numeric,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_experiments TO authenticated;
GRANT ALL ON public.mil_experiments TO service_role;
ALTER TABLE public.mil_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_experiments admin" ON public.mil_experiments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Root cause Why-chains
CREATE TABLE public.mil_root_cause_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_ref text,
  symptom text NOT NULL,
  chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  root_cause text,
  confidence numeric,
  recommended_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_root_cause_chains TO authenticated;
GRANT ALL ON public.mil_root_cause_chains TO service_role;
ALTER TABLE public.mil_root_cause_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_rc admin" ON public.mil_root_cause_chains FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Meta knowledge graph
CREATE TABLE public.mil_knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL,
  source_id text NOT NULL,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mil_edges_src_idx ON public.mil_knowledge_edges(source_kind, source_id);
CREATE INDEX mil_edges_tgt_idx ON public.mil_knowledge_edges(target_kind, target_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_knowledge_edges TO authenticated;
GRANT ALL ON public.mil_knowledge_edges TO service_role;
ALTER TABLE public.mil_knowledge_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_edges admin" ON public.mil_knowledge_edges FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Leaderboard snapshots
CREATE TABLE public.mil_leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT (now()::date),
  rankings jsonb NOT NULL DEFAULT '[]'::jsonb,
  most_accurate text,
  most_profitable text,
  fastest_learning text,
  worst_performer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_leaderboard_snapshots TO authenticated;
GRANT ALL ON public.mil_leaderboard_snapshots TO service_role;
ALTER TABLE public.mil_leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_lb admin" ON public.mil_leaderboard_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Monthly strategy reports
CREATE TABLE public.mil_strategy_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL UNIQUE,
  biggest_wins jsonb NOT NULL DEFAULT '[]'::jsonb,
  biggest_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_ai text,
  worst_ai text,
  highest_roi_experiments jsonb NOT NULL DEFAULT '[]'::jsonb,
  forecast_accuracy numeric,
  strategic_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  threats jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_strategy_reports TO authenticated;
GRANT ALL ON public.mil_strategy_reports TO service_role;
ALTER TABLE public.mil_strategy_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_reports admin" ON public.mil_strategy_reports FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Settings
CREATE TABLE public.mil_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_settings TO authenticated;
GRANT ALL ON public.mil_settings TO service_role;
ALTER TABLE public.mil_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_settings admin" ON public.mil_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Runs and steps
CREATE TABLE public.mil_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  engines_reviewed int DEFAULT 0,
  decisions_evaluated int DEFAULT 0,
  experiments_launched int DEFAULT 0,
  weight_adjustments int DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_runs TO authenticated;
GRANT ALL ON public.mil_runs TO service_role;
ALTER TABLE public.mil_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_runs admin" ON public.mil_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.mil_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.mil_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  duration_ms int,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mil_run_steps TO authenticated;
GRANT ALL ON public.mil_run_steps TO service_role;
ALTER TABLE public.mil_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mil_run_steps admin" ON public.mil_run_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
