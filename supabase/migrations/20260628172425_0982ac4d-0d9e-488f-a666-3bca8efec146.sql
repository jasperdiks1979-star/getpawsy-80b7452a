
-- 1. Advisor registry
CREATE TABLE IF NOT EXISTS public.aec_advisors (
  advisor_key text PRIMARY KEY,
  display_name text NOT NULL,
  domain text NOT NULL,
  default_weight numeric NOT NULL DEFAULT 1.0,
  current_weight numeric NOT NULL DEFAULT 1.0,
  reliability_score numeric NOT NULL DEFAULT 0.5,
  decisions_observed integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aec_advisors TO authenticated;
GRANT ALL ON public.aec_advisors TO service_role;
ALTER TABLE public.aec_advisors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_advisors_admin_read" ON public.aec_advisors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Council runs
CREATE TABLE IF NOT EXISTS public.aec_council_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  decisions_count integer NOT NULL DEFAULT 0,
  advisors_polled integer NOT NULL DEFAULT 0,
  council_confidence numeric,
  council_consensus text,
  projected_monthly_revenue_cents bigint,
  projected_growth_pct numeric,
  decision_quality_score numeric,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aec_council_runs TO authenticated;
GRANT ALL ON public.aec_council_runs TO service_role;
ALTER TABLE public.aec_council_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_runs_admin_read" ON public.aec_council_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Advisor votes
CREATE TABLE IF NOT EXISTS public.aec_advisor_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.aec_council_runs(id) ON DELETE CASCADE,
  decision_id uuid,
  advisor_key text NOT NULL,
  recommendation text NOT NULL,
  confidence numeric,
  risk numeric,
  expected_roi numeric,
  evidence_quality numeric,
  time_horizon text,
  weight numeric NOT NULL DEFAULT 1.0,
  vote_score numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aec_votes_run_idx ON public.aec_advisor_votes(run_id);
CREATE INDEX IF NOT EXISTS aec_votes_decision_idx ON public.aec_advisor_votes(decision_id);
GRANT SELECT ON public.aec_advisor_votes TO authenticated;
GRANT ALL ON public.aec_advisor_votes TO service_role;
ALTER TABLE public.aec_advisor_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_votes_admin_read" ON public.aec_advisor_votes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. Council decisions
CREATE TABLE IF NOT EXISTS public.aec_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.aec_council_runs(id) ON DELETE CASCADE,
  decision_type text NOT NULL,
  subject_kind text,
  subject_id text,
  final_action text NOT NULL,
  consensus text NOT NULL,
  short_term_benefit numeric,
  long_term_benefit numeric,
  expected_revenue_cents bigint,
  expected_stability numeric,
  expected_learning_value numeric,
  expected_risk numeric,
  expected_maintenance_cost numeric,
  votes_for integer NOT NULL DEFAULT 0,
  votes_against integer NOT NULL DEFAULT 0,
  weighted_score numeric,
  council_confidence numeric,
  explanation text,
  reason_codes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  xai_decision_id uuid,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz,
  actual_outcome jsonb
);
CREATE INDEX IF NOT EXISTS aec_decisions_run_idx ON public.aec_decisions(run_id);
GRANT SELECT ON public.aec_decisions TO authenticated;
GRANT ALL ON public.aec_decisions TO service_role;
ALTER TABLE public.aec_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_decisions_admin_read" ON public.aec_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. Priorities
CREATE TABLE IF NOT EXISTS public.aec_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.aec_council_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  rank integer NOT NULL,
  title text NOT NULL,
  subject_kind text,
  subject_id text,
  score numeric,
  confidence numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aec_priorities_run_kind_idx ON public.aec_priorities(run_id, kind, rank);
GRANT SELECT ON public.aec_priorities TO authenticated;
GRANT ALL ON public.aec_priorities TO service_role;
ALTER TABLE public.aec_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_priorities_admin_read" ON public.aec_priorities FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. Briefings
CREATE TABLE IF NOT EXISTS public.aec_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  for_date date NOT NULL UNIQUE,
  run_id uuid REFERENCES public.aec_council_runs(id) ON DELETE SET NULL,
  yesterday_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  highest_roi text,
  highest_risk text,
  largest_opportunity text,
  estimated_monthly_revenue_cents bigint,
  estimated_confidence numeric,
  required_founder_action text NOT NULL DEFAULT 'None',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aec_briefings TO authenticated;
GRANT ALL ON public.aec_briefings TO service_role;
ALTER TABLE public.aec_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_briefings_admin_read" ON public.aec_briefings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. Reliability ledger
CREATE TABLE IF NOT EXISTS public.aec_reliability_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_key text NOT NULL,
  week_start date NOT NULL,
  decisions_evaluated integer NOT NULL DEFAULT 0,
  prediction_accuracy numeric,
  decision_accuracy numeric,
  roi_accuracy numeric,
  confidence_calibration numeric,
  learning_efficiency numeric,
  false_positives integer NOT NULL DEFAULT 0,
  false_negatives integer NOT NULL DEFAULT 0,
  reliability_score numeric,
  new_weight numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (advisor_key, week_start)
);
GRANT SELECT ON public.aec_reliability_ledger TO authenticated;
GRANT ALL ON public.aec_reliability_ledger TO service_role;
ALTER TABLE public.aec_reliability_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aec_reliability_admin_read" ON public.aec_reliability_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed advisors
INSERT INTO public.aec_advisors (advisor_key, display_name, domain) VALUES
  ('creative_factory', 'Creative Factory', 'creative_production'),
  ('quality_engine', 'Quality Engine', 'creative_quality'),
  ('verification_engine', 'Verification Engine', 'integrity'),
  ('growth_director', 'Growth Director', 'growth_strategy'),
  ('experiment_engine', 'Experiment Engine', 'experimentation'),
  ('market_intelligence', 'Market Intelligence', 'external_signals'),
  ('collective_intelligence', 'Collective Intelligence', 'cross_engine_synthesis'),
  ('adaptive_learning_governor', 'Adaptive Learning Governor', 'learning_safety'),
  ('evidence_governor', 'Evidence Governor', 'trait_weights'),
  ('explainable_ai', 'Explainable AI', 'decision_quality'),
  ('health_monitor', 'Health Monitor', 'operational_health'),
  ('trend_intelligence', 'Trend Intelligence', 'trend_signals'),
  ('board_intelligence', 'Board Intelligence', 'board_routing')
ON CONFLICT (advisor_key) DO NOTHING;
