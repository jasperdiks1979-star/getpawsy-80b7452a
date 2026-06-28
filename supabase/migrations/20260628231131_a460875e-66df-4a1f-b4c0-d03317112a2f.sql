
CREATE TABLE public.gvcae_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  domain text,
  owner text,
  status text NOT NULL DEFAULT 'active',
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gvcae_modules TO authenticated;
GRANT ALL ON public.gvcae_modules TO service_role;
ALTER TABLE public.gvcae_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_modules" ON public.gvcae_modules FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  health numeric,
  complexity numeric,
  coupling numeric,
  duplication numeric,
  maintainability numeric,
  reliability numeric,
  performance numeric,
  security numeric,
  observability numeric,
  testability numeric,
  documentation numeric,
  reuse numeric,
  overall numeric,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX gvcae_health_module_idx ON public.gvcae_health_scores(module_key, captured_at DESC);
GRANT SELECT ON public.gvcae_health_scores TO authenticated;
GRANT ALL ON public.gvcae_health_scores TO service_role;
ALTER TABLE public.gvcae_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_health" ON public.gvcae_health_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_module text NOT NULL,
  to_module text NOT NULL,
  dep_type text NOT NULL DEFAULT 'uses',
  criticality numeric NOT NULL DEFAULT 0.5,
  is_critical_path boolean NOT NULL DEFAULT false,
  is_single_point_of_failure boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_module, to_module, dep_type)
);
GRANT SELECT ON public.gvcae_dependencies TO authenticated;
GRANT ALL ON public.gvcae_dependencies TO service_role;
ALTER TABLE public.gvcae_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_deps" ON public.gvcae_dependencies FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  members text[] NOT NULL,
  similarity numeric,
  recommendation text,
  status text NOT NULL DEFAULT 'open',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.gvcae_duplicates TO authenticated;
GRANT ALL ON public.gvcae_duplicates TO service_role;
ALTER TABLE public.gvcae_duplicates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_dupes" ON public.gvcae_duplicates FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_value_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  dev_cost numeric DEFAULT 0,
  maintenance_cost numeric DEFAULT 0,
  operational_cost numeric DEFAULT 0,
  ai_credit_cost numeric DEFAULT 0,
  infra_cost numeric DEFAULT 0,
  business_value numeric DEFAULT 0,
  revenue_contribution numeric DEFAULT 0,
  learning_contribution numeric DEFAULT 0,
  risk numeric DEFAULT 0,
  net_value numeric,
  verdict text,
  rationale text
);
CREATE INDEX gvcae_value_module_idx ON public.gvcae_value_analysis(module_key, captured_at DESC);
GRANT SELECT ON public.gvcae_value_analysis TO authenticated;
GRANT ALL ON public.gvcae_value_analysis TO service_role;
ALTER TABLE public.gvcae_value_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_value" ON public.gvcae_value_analysis FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_simplification_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  proposal_type text NOT NULL,
  targets text[] NOT NULL,
  summary text NOT NULL,
  expected_benefit text,
  effort text,
  risk text,
  status text NOT NULL DEFAULT 'pending',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz,
  decided_by uuid
);
GRANT SELECT ON public.gvcae_simplification_proposals TO authenticated;
GRANT ALL ON public.gvcae_simplification_proposals TO service_role;
ALTER TABLE public.gvcae_simplification_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_simpl" ON public.gvcae_simplification_proposals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_change_impact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  change_title text NOT NULL,
  modules_affected text[] NOT NULL,
  risk_score numeric,
  business_impact numeric,
  migration_effort text,
  rollback_complexity text,
  performance_impact text,
  revenue_impact text,
  operational_impact text,
  recommendation text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.gvcae_change_impact TO authenticated;
GRANT ALL ON public.gvcae_change_impact TO service_role;
ALTER TABLE public.gvcae_change_impact ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_impact" ON public.gvcae_change_impact FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_tech_debt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  module_key text,
  title text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  business_risk numeric DEFAULT 0,
  operational_risk numeric DEFAULT 0,
  maintenance_cost numeric DEFAULT 0,
  complexity numeric DEFAULT 0,
  performance_impact numeric DEFAULT 0,
  expected_roi numeric DEFAULT 0,
  priority_score numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX gvcae_debt_priority_idx ON public.gvcae_tech_debt(priority_score DESC);
GRANT SELECT ON public.gvcae_tech_debt TO authenticated;
GRANT ALL ON public.gvcae_tech_debt TO service_role;
ALTER TABLE public.gvcae_tech_debt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_debt" ON public.gvcae_tech_debt FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  maintainability numeric,
  scalability numeric,
  reliability numeric,
  performance numeric,
  security numeric,
  modularity numeric,
  observability numeric,
  testability numeric,
  documentation numeric,
  knowledge_reuse numeric,
  overall_score numeric,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(period)
);
GRANT SELECT ON public.gvcae_scorecards TO authenticated;
GRANT ALL ON public.gvcae_scorecards TO service_role;
ALTER TABLE public.gvcae_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_scorecards" ON public.gvcae_scorecards FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  became_better jsonb NOT NULL DEFAULT '[]'::jsonb,
  became_worse jsonb NOT NULL DEFAULT '[]'::jsonb,
  obsolete jsonb NOT NULL DEFAULT '[]'::jsonb,
  to_merge jsonb NOT NULL DEFAULT '[]'::jsonb,
  to_remove jsonb NOT NULL DEFAULT '[]'::jsonb,
  to_rewrite jsonb NOT NULL DEFAULT '[]'::jsonb,
  never_should_have jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  UNIQUE(period)
);
GRANT SELECT ON public.gvcae_reviews TO authenticated;
GRANT ALL ON public.gvcae_reviews TO service_role;
ALTER TABLE public.gvcae_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_reviews" ON public.gvcae_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.gvcae_audit_runs TO authenticated;
GRANT ALL ON public.gvcae_audit_runs TO service_role;
ALTER TABLE public.gvcae_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_runs" ON public.gvcae_audit_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_audit_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.gvcae_audit_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.gvcae_audit_steps TO authenticated;
GRANT ALL ON public.gvcae_audit_steps TO service_role;
ALTER TABLE public.gvcae_audit_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_steps" ON public.gvcae_audit_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.gvcae_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gvcae_settings TO authenticated;
GRANT ALL ON public.gvcae_settings TO service_role;
ALTER TABLE public.gvcae_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gvcae_settings" ON public.gvcae_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
