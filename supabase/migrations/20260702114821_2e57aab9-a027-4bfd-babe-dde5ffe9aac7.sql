-- GENESIS Ω∞ V7 — Autonomous Recovery Engine (G.A.R.E.)
-- Tables to persist detections, root-cause analyses, recovery plans,
-- executions, certifications, and permanent learning.

CREATE TABLE IF NOT EXISTS public.gare_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subsystem TEXT NOT NULL,
  metric TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','critical','unknown','emergency')),
  observed_value JSONB,
  baseline_value JSONB,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','diagnosing','planned','repairing','resolved','approval','failed','skipped')),
  first_sales_impact BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gare_detections TO authenticated;
GRANT ALL ON public.gare_detections TO service_role;
ALTER TABLE public.gare_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_detections admin read" ON public.gare_detections
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gare_root_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES public.gare_detections(id) ON DELETE CASCADE,
  why_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  root_cause TEXT,
  confidence NUMERIC(5,2),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gare_root_causes TO authenticated;
GRANT ALL ON public.gare_root_causes TO service_role;
ALTER TABLE public.gare_root_causes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_root_causes admin read" ON public.gare_root_causes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gare_recovery_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES public.gare_detections(id) ON DELETE CASCADE,
  root_cause_id UUID REFERENCES public.gare_root_causes(id) ON DELETE SET NULL,
  plan JSONB NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  auto_safe BOOLEAN NOT NULL DEFAULT false,
  rollback JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_revenue_gain NUMERIC(12,2),
  expected_bhi_gain NUMERIC(6,2),
  confidence NUMERIC(5,2),
  first_sales_boost BOOLEAN NOT NULL DEFAULT false,
  approval_required BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gare_recovery_plans TO authenticated;
GRANT ALL ON public.gare_recovery_plans TO service_role;
ALTER TABLE public.gare_recovery_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_recovery_plans admin read" ON public.gare_recovery_plans
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "gare_recovery_plans admin write" ON public.gare_recovery_plans
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gare_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.gare_recovery_plans(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  outcome TEXT NOT NULL DEFAULT 'running' CHECK (outcome IN ('running','success','failed','rolled_back')),
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  regression_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  revenue_delta NUMERIC(12,2),
  bhi_delta NUMERIC(6,2),
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gare_executions TO authenticated;
GRANT ALL ON public.gare_executions TO service_role;
ALTER TABLE public.gare_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_executions admin read" ON public.gare_executions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gare_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.gare_executions(id) ON DELETE CASCADE,
  report_title TEXT NOT NULL,
  report JSONB NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.gare_certifications TO authenticated;
GRANT ALL ON public.gare_certifications TO service_role;
ALTER TABLE public.gare_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_certifications admin read" ON public.gare_certifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gare_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_signature TEXT NOT NULL,
  subsystem TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  fix_recipe JSONB NOT NULL,
  outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  avg_revenue_gain NUMERIC(12,2),
  avg_recovery_seconds INTEGER,
  prediction_accuracy NUMERIC(5,2),
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(problem_signature)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gare_learning TO authenticated;
GRANT ALL ON public.gare_learning TO service_role;
ALTER TABLE public.gare_learning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_learning admin read" ON public.gare_learning
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gare_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  problems_detected INTEGER NOT NULL DEFAULT 0,
  problems_repaired INTEGER NOT NULL DEFAULT 0,
  problems_pending_approval INTEGER NOT NULL DEFAULT 0,
  repair_success_pct NUMERIC(5,2),
  regression_pct NUMERIC(5,2),
  rollback_pct NUMERIC(5,2),
  avg_recovery_seconds INTEGER,
  revenue_recovered_24h NUMERIC(12,2),
  bhi_gained_24h NUMERIC(6,2),
  self_heal_score NUMERIC(5,2),
  confidence NUMERIC(5,2)
);
GRANT SELECT, INSERT ON public.gare_score_snapshots TO authenticated;
GRANT ALL ON public.gare_score_snapshots TO service_role;
ALTER TABLE public.gare_score_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gare_score_snapshots admin read" ON public.gare_score_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_gare_detections_status ON public.gare_detections(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_gare_executions_outcome ON public.gare_executions(outcome, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gare_plans_status ON public.gare_recovery_plans(status, created_at DESC);
