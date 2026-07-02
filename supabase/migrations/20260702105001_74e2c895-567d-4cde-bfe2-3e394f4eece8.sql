
-- Genesis V5 Decision Outcome Engine
CREATE TABLE IF NOT EXISTS public.genesis_v5_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_key TEXT UNIQUE,
  subsystem TEXT NOT NULL,
  category TEXT,
  business_objective TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  expected_revenue_cents BIGINT DEFAULT 0,
  expected_profit_cents BIGINT DEFAULT 0,
  expected_conversion_lift_pct NUMERIC DEFAULT 0,
  expected_credit_savings NUMERIC DEFAULT 0,
  best_case JSONB DEFAULT '{}'::jsonb,
  worst_case JSONB DEFAULT '{}'::jsonb,
  risk TEXT DEFAULT 'low',
  rollback_plan TEXT,
  approver TEXT,
  deployment_sha TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.genesis_v5_decisions TO authenticated;
GRANT ALL ON public.genesis_v5_decisions TO service_role;
ALTER TABLE public.genesis_v5_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v5_decisions_admin_all" ON public.genesis_v5_decisions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_v5_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES public.genesis_v5_decisions(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  window_days INT DEFAULT 7
);
GRANT SELECT, INSERT ON public.genesis_v5_baselines TO authenticated;
GRANT ALL ON public.genesis_v5_baselines TO service_role;
ALTER TABLE public.genesis_v5_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v5_baselines_admin" ON public.genesis_v5_baselines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_v5_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.genesis_v5_decisions(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL, -- 1h, 24h, 3d, 7d, 30d
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  deltas JSONB NOT NULL DEFAULT '{}'::jsonb,
  prediction_accuracy NUMERIC,
  revenue_accuracy NUMERIC,
  confidence_accuracy NUMERIC,
  verdict TEXT, -- success | mixed | failure | inconclusive
  notes TEXT,
  UNIQUE (decision_id, horizon)
);
GRANT SELECT, INSERT, UPDATE ON public.genesis_v5_outcomes TO authenticated;
GRANT ALL ON public.genesis_v5_outcomes TO service_role;
ALTER TABLE public.genesis_v5_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v5_outcomes_admin" ON public.genesis_v5_outcomes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_v5_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES public.genesis_v5_decisions(id) ON DELETE SET NULL,
  category TEXT,
  root_cause TEXT,
  lesson TEXT NOT NULL,
  future_applicability TEXT,
  weight NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.genesis_v5_lessons TO authenticated;
GRANT ALL ON public.genesis_v5_lessons TO service_role;
ALTER TABLE public.genesis_v5_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v5_lessons_admin" ON public.genesis_v5_lessons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_v5_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem TEXT NOT NULL,
  category TEXT,
  window_days INT NOT NULL DEFAULT 30,
  decisions_total INT DEFAULT 0,
  decisions_successful INT DEFAULT 0,
  prediction_accuracy NUMERIC,
  revenue_accuracy NUMERIC,
  confidence_reliability NUMERIC,
  average_roi NUMERIC,
  success_rate NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.genesis_v5_scores TO authenticated;
GRANT ALL ON public.genesis_v5_scores TO service_role;
ALTER TABLE public.genesis_v5_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v5_scores_admin" ON public.genesis_v5_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_v5_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_days INT DEFAULT 30,
  prediction_accuracy NUMERIC,
  recommendation_accuracy NUMERIC,
  revenue_accuracy NUMERIC,
  confidence_calibration NUMERIC,
  learning_curve NUMERIC,
  business_impact_cents BIGINT DEFAULT 0,
  executive_summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sha256 TEXT
);
GRANT SELECT, INSERT ON public.genesis_v5_certifications TO authenticated;
GRANT ALL ON public.genesis_v5_certifications TO service_role;
ALTER TABLE public.genesis_v5_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v5_certs_admin" ON public.genesis_v5_certifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_v5_decisions_subsystem ON public.genesis_v5_decisions(subsystem, status);
CREATE INDEX IF NOT EXISTS idx_v5_decisions_created ON public.genesis_v5_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v5_outcomes_decision ON public.genesis_v5_outcomes(decision_id);
