
CREATE TABLE IF NOT EXISTS public.pcie2_xai_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_engine text NOT NULL,
  decision_type text NOT NULL,
  subject_kind text,
  subject_id text,
  summary text NOT NULL,
  plain_english text NOT NULL,
  reason_codes text[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  counterfactual jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  evidence_strength numeric,
  risk numeric,
  expected_lift numeric,
  estimated_downside numeric,
  expected_metric text,
  evidence_sample_size integer,
  evidence_freshness_days integer,
  explainability_score numeric,
  decision_age_days integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  linked_decision_id uuid,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_xai_decisions TO authenticated;
GRANT ALL ON public.pcie2_xai_decisions TO service_role;
ALTER TABLE public.pcie2_xai_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xai_decisions_admin_read" ON public.pcie2_xai_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS pcie2_xai_decisions_created_idx ON public.pcie2_xai_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS pcie2_xai_decisions_engine_idx ON public.pcie2_xai_decisions(source_engine, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pcie2_xai_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.pcie2_xai_decisions(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  window_days integer NOT NULL DEFAULT 7,
  actual_lift numeric,
  revenue_impact_cents bigint DEFAULT 0,
  ctr_impact numeric,
  save_impact numeric,
  purchase_impact numeric,
  prediction_error numeric,
  was_correct boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_xai_outcomes TO authenticated;
GRANT ALL ON public.pcie2_xai_outcomes TO service_role;
ALTER TABLE public.pcie2_xai_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xai_outcomes_admin_read" ON public.pcie2_xai_outcomes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS pcie2_xai_outcomes_decision_idx ON public.pcie2_xai_outcomes(decision_id);

CREATE TABLE IF NOT EXISTS public.pcie2_xai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  window_days integer NOT NULL DEFAULT 14,
  total_decisions integer DEFAULT 0,
  evaluated_decisions integer DEFAULT 0,
  correct_predictions integer DEFAULT 0,
  prediction_accuracy numeric,
  avg_prediction_error numeric,
  confidence_calibration numeric,
  explainability_score numeric,
  evidence_completeness numeric,
  decision_traceability numeric,
  missing_evidence_pct numeric,
  decision_quality_score numeric,
  best_decision_id uuid,
  worst_decision_id uuid,
  highest_roi_decision_id uuid,
  most_expensive_mistake_id uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_xai_evaluations TO authenticated;
GRANT ALL ON public.pcie2_xai_evaluations TO service_role;
ALTER TABLE public.pcie2_xai_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xai_evaluations_admin_read" ON public.pcie2_xai_evaluations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.update_pcie2_xai_decisions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_pcie2_xai_decisions_updated_at ON public.pcie2_xai_decisions;
CREATE TRIGGER trg_pcie2_xai_decisions_updated_at BEFORE UPDATE ON public.pcie2_xai_decisions
FOR EACH ROW EXECUTE FUNCTION public.update_pcie2_xai_decisions_updated_at();
