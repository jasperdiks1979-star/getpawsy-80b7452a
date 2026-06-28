
-- Immutable append-only decision ledger
CREATE TABLE public.agal_decision_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no bigserial NOT NULL,
  engine_key text NOT NULL,
  engine_version text,
  decision_type text NOT NULL,
  subject text,
  prompt text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning text,
  confidence numeric,
  expected_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_result jsonb,
  financial_impact_cents bigint,
  business_impact_score numeric,
  prev_hash text,
  row_hash text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX agal_ledger_engine_idx ON public.agal_decision_ledger(engine_key, recorded_at DESC);
CREATE INDEX agal_ledger_seq_idx ON public.agal_decision_ledger(sequence_no);
GRANT SELECT, INSERT ON public.agal_decision_ledger TO authenticated;
GRANT ALL ON public.agal_decision_ledger TO service_role;
ALTER TABLE public.agal_decision_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_ledger admin read" ON public.agal_decision_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "agal_ledger admin insert" ON public.agal_decision_ledger FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Block updates/deletes on the ledger (append-only)
CREATE OR REPLACE FUNCTION public.agal_block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AGAL ledger is append-only; mutation denied';
END;
$$;
CREATE TRIGGER agal_ledger_no_update BEFORE UPDATE ON public.agal_decision_ledger FOR EACH ROW EXECUTE FUNCTION public.agal_block_mutation();
CREATE TRIGGER agal_ledger_no_delete BEFORE DELETE ON public.agal_decision_ledger FOR EACH ROW EXECUTE FUNCTION public.agal_block_mutation();

-- Truth validations
CREATE TABLE public.agal_truth_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  decision_ledger_id uuid REFERENCES public.agal_decision_ledger(id) ON DELETE SET NULL,
  metric text NOT NULL,
  predicted numeric,
  actual numeric,
  error_abs numeric,
  error_pct numeric,
  calibration_score numeric,
  verdict text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agal_truth_engine_idx ON public.agal_truth_validations(engine_key, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.agal_truth_validations TO authenticated;
GRANT ALL ON public.agal_truth_validations TO service_role;
ALTER TABLE public.agal_truth_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_truth admin" ON public.agal_truth_validations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trust scores
CREATE TABLE public.agal_trust_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  prediction_score numeric,
  calibration_score numeric,
  reasoning_score numeric,
  bias_score numeric,
  stability_score numeric,
  learning_score numeric,
  business_impact_score numeric,
  transparency_score numeric,
  reliability_score numeric,
  overall_trust numeric,
  sample_size int,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(engine_key, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agal_trust_scores TO authenticated;
GRANT ALL ON public.agal_trust_scores TO service_role;
ALTER TABLE public.agal_trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_trust admin" ON public.agal_trust_scores FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Bias signals
CREATE TABLE public.agal_bias_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  bias_type text NOT NULL,
  severity numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notes text
);
GRANT SELECT, INSERT, UPDATE ON public.agal_bias_signals TO authenticated;
GRANT ALL ON public.agal_bias_signals TO service_role;
ALTER TABLE public.agal_bias_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_bias admin" ON public.agal_bias_signals FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Anomalies
CREATE TABLE public.agal_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  anomaly_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  description text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX agal_anomaly_status_idx ON public.agal_anomalies(status, detected_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.agal_anomalies TO authenticated;
GRANT ALL ON public.agal_anomalies TO service_role;
ALTER TABLE public.agal_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_anom admin" ON public.agal_anomalies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Reasoning audits
CREATE TABLE public.agal_reasoning_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_ledger_id uuid REFERENCES public.agal_decision_ledger(id) ON DELETE SET NULL,
  engine_key text NOT NULL,
  logic_score numeric,
  evidence_score numeric,
  uncertainty_score numeric,
  alternatives_considered boolean,
  jumped_to_conclusion boolean,
  overall_score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_reasoning_audits TO authenticated;
GRANT ALL ON public.agal_reasoning_audits TO service_role;
ALTER TABLE public.agal_reasoning_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_reason admin" ON public.agal_reasoning_audits FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Root cause validations
CREATE TABLE public.agal_root_cause_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upstream_engine text NOT NULL,
  claim text NOT NULL,
  independent_verdict text,
  agreement boolean,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_root_cause_validations TO authenticated;
GRANT ALL ON public.agal_root_cause_validations TO service_role;
ALTER TABLE public.agal_root_cause_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_rcv admin" ON public.agal_root_cause_validations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Risk assessments
CREATE TABLE public.agal_risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  action_ref text,
  financial_risk numeric,
  technical_risk numeric,
  brand_risk numeric,
  legal_risk numeric,
  operational_risk numeric,
  customer_risk numeric,
  overall_risk numeric,
  verdict text,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_risk_assessments TO authenticated;
GRANT ALL ON public.agal_risk_assessments TO service_role;
ALTER TABLE public.agal_risk_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_risk admin" ON public.agal_risk_assessments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Version snapshots (rollback)
CREATE TABLE public.agal_version_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  artifact_kind text NOT NULL,
  artifact_ref text NOT NULL,
  version_label text,
  payload jsonb NOT NULL,
  hash text,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agal_version_engine_idx ON public.agal_version_snapshots(engine_key, artifact_kind, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.agal_version_snapshots TO authenticated;
GRANT ALL ON public.agal_version_snapshots TO service_role;
ALTER TABLE public.agal_version_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_ver admin" ON public.agal_version_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Compliance checks
CREATE TABLE public.agal_compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  rule text NOT NULL,
  status text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_compliance_checks TO authenticated;
GRANT ALL ON public.agal_compliance_checks TO service_role;
ALTER TABLE public.agal_compliance_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_comp admin" ON public.agal_compliance_checks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Incidents & forensic investigations
CREATE TABLE public.agal_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  estimated_revenue_loss_cents bigint,
  summary text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.agal_incidents TO authenticated;
GRANT ALL ON public.agal_incidents TO service_role;
ALTER TABLE public.agal_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_inc admin" ON public.agal_incidents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.agal_forensic_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.agal_incidents(id) ON DELETE CASCADE,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_bad_assumption text,
  first_bad_decision text,
  cascade jsonb NOT NULL DEFAULT '[]'::jsonb,
  lessons_learned text,
  frozen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_forensic_investigations TO authenticated;
GRANT ALL ON public.agal_forensic_investigations TO service_role;
ALTER TABLE public.agal_forensic_investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_for admin" ON public.agal_forensic_investigations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Executive reports
CREATE TABLE public.agal_executive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  most_reliable_ai text,
  least_reliable_ai text,
  biggest_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  biggest_successes jsonb NOT NULL DEFAULT '[]'::jsonb,
  bias_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust_trend jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_executive_reports TO authenticated;
GRANT ALL ON public.agal_executive_reports TO service_role;
ALTER TABLE public.agal_executive_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_rep admin" ON public.agal_executive_reports FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- AI Constitution (immutable principles)
CREATE TABLE public.agal_constitution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principle text NOT NULL UNIQUE,
  description text,
  locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agal_constitution TO authenticated;
GRANT ALL ON public.agal_constitution TO service_role;
ALTER TABLE public.agal_constitution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_const admin read" ON public.agal_constitution FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "agal_const admin insert" ON public.agal_constitution FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER agal_const_no_update BEFORE UPDATE ON public.agal_constitution FOR EACH ROW EXECUTE FUNCTION public.agal_block_mutation();
CREATE TRIGGER agal_const_no_delete BEFORE DELETE ON public.agal_constitution FOR EACH ROW EXECUTE FUNCTION public.agal_block_mutation();

-- Audit runs + steps
CREATE TABLE public.agal_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  engines_audited int DEFAULT 0,
  validations int DEFAULT 0,
  anomalies_found int DEFAULT 0,
  biases_found int DEFAULT 0,
  trust_updates int DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT, INSERT, UPDATE ON public.agal_audit_runs TO authenticated;
GRANT ALL ON public.agal_audit_runs TO service_role;
ALTER TABLE public.agal_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_runs admin" ON public.agal_audit_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.agal_audit_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agal_audit_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  duration_ms int,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agal_audit_steps TO authenticated;
GRANT ALL ON public.agal_audit_steps TO service_role;
ALTER TABLE public.agal_audit_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_steps admin" ON public.agal_audit_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Settings
CREATE TABLE public.agal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agal_settings TO authenticated;
GRANT ALL ON public.agal_settings TO service_role;
ALTER TABLE public.agal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agal_settings admin" ON public.agal_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
