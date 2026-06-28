
CREATE TABLE public.trpe_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trpe_settings_singleton CHECK (id = TRUE)
);
GRANT ALL ON public.trpe_settings TO service_role;
GRANT SELECT ON public.trpe_settings TO authenticated;
ALTER TABLE public.trpe_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_settings admin" ON public.trpe_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_subsystems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  owner TEXT,
  critical BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.trpe_subsystems TO service_role;
GRANT SELECT ON public.trpe_subsystems TO authenticated;
ALTER TABLE public.trpe_subsystems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_subsystems admin" ON public.trpe_subsystems FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem TEXT NOT NULL,
  health_score NUMERIC NOT NULL,
  status TEXT NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trpe_health_snapshots_sub_time ON public.trpe_health_snapshots (subsystem, captured_at DESC);
GRANT ALL ON public.trpe_health_snapshots TO service_role;
GRANT SELECT ON public.trpe_health_snapshots TO authenticated;
ALTER TABLE public.trpe_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_health admin" ON public.trpe_health_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_reliability_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem TEXT NOT NULL,
  availability NUMERIC,
  mtbf_minutes NUMERIC,
  mttr_minutes NUMERIC,
  error_budget_remaining NUMERIC,
  retry_rate NUMERIC,
  timeout_rate NUMERIC,
  failure_rate NUMERIC,
  latency_p95_ms NUMERIC,
  success_rate NUMERIC,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trpe_reliability_sub_time ON public.trpe_reliability_metrics (subsystem, window_end DESC);
GRANT ALL ON public.trpe_reliability_metrics TO service_role;
GRANT SELECT ON public.trpe_reliability_metrics TO authenticated;
ALTER TABLE public.trpe_reliability_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_reliability admin" ON public.trpe_reliability_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_integrity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  found_count INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trpe_integrity_time ON public.trpe_integrity_checks (ran_at DESC);
GRANT ALL ON public.trpe_integrity_checks TO service_role;
GRANT SELECT ON public.trpe_integrity_checks TO authenticated;
ALTER TABLE public.trpe_integrity_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_integrity admin" ON public.trpe_integrity_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_self_healing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL,
  subsystem TEXT NOT NULL,
  action TEXT NOT NULL,
  safe_mode BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending',
  outcome TEXT,
  escalated BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX trpe_healing_time ON public.trpe_self_healing_actions (created_at DESC);
GRANT ALL ON public.trpe_self_healing_actions TO service_role;
GRANT SELECT ON public.trpe_self_healing_actions TO authenticated;
ALTER TABLE public.trpe_self_healing_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_healing admin" ON public.trpe_self_healing_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_slos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subsystem TEXT NOT NULL,
  metric TEXT NOT NULL,
  target NUMERIC NOT NULL,
  window_label TEXT NOT NULL DEFAULT '30d',
  current_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.trpe_slos TO service_role;
GRANT SELECT ON public.trpe_slos TO authenticated;
ALTER TABLE public.trpe_slos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_slos admin" ON public.trpe_slos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_slo_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_id UUID NOT NULL REFERENCES public.trpe_slos(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trpe_slo_eval_slo_time ON public.trpe_slo_evaluations (slo_id, evaluated_at DESC);
GRANT ALL ON public.trpe_slo_evaluations TO service_role;
GRANT SELECT ON public.trpe_slo_evaluations TO authenticated;
ALTER TABLE public.trpe_slo_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_slo_eval admin" ON public.trpe_slo_evaluations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  owner TEXT,
  subsystem TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  impact TEXT,
  root_cause TEXT,
  recovery TEXT,
  preventive_action TEXT,
  learning TEXT,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trpe_incidents_time ON public.trpe_incidents (detected_at DESC);
GRANT ALL ON public.trpe_incidents TO service_role;
GRANT SELECT ON public.trpe_incidents TO authenticated;
ALTER TABLE public.trpe_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_incidents admin" ON public.trpe_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  expected_outcome TEXT,
  rollback_plan TEXT,
  risk TEXT NOT NULL DEFAULT 'low',
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned',
  post_review TEXT,
  validated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deployed_at TIMESTAMPTZ
);
CREATE INDEX trpe_changes_time ON public.trpe_changes (created_at DESC);
GRANT ALL ON public.trpe_changes TO service_role;
GRANT SELECT ON public.trpe_changes TO authenticated;
ALTER TABLE public.trpe_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_changes admin" ON public.trpe_changes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trpe_verif_journey_time ON public.trpe_verification_runs (journey, ran_at DESC);
GRANT ALL ON public.trpe_verification_runs TO service_role;
GRANT SELECT ON public.trpe_verification_runs TO authenticated;
ALTER TABLE public.trpe_verification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_verif admin" ON public.trpe_verification_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trpe_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX trpe_runs_time ON public.trpe_runs (started_at DESC);
GRANT ALL ON public.trpe_runs TO service_role;
GRANT SELECT ON public.trpe_runs TO authenticated;
ALTER TABLE public.trpe_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trpe_runs admin" ON public.trpe_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.trpe_subsystems (name, category, critical, description) VALUES
  ('api','infra',TRUE,'Edge functions API surface'),
  ('database','infra',TRUE,'Postgres + RLS'),
  ('queue','infra',TRUE,'Background job queue'),
  ('worker','infra',TRUE,'Background workers'),
  ('cron','infra',TRUE,'Scheduled jobs'),
  ('pinterest_publishing','marketing',TRUE,'Pinterest publish pipeline'),
  ('creative_rendering','creative',TRUE,'PCIE/Creative rendering'),
  ('analytics_ingestion','analytics',TRUE,'GA4/event ingestion'),
  ('revenue_tracking','revenue',TRUE,'Revenue attribution + orders'),
  ('checkout','revenue',TRUE,'Stripe checkout flow')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.trpe_slos (name, subsystem, metric, target, window_label) VALUES
  ('pinterest_publish_success','pinterest_publishing','success_rate',0.98,'7d'),
  ('checkout_availability','checkout','availability',0.999,'30d'),
  ('creative_generation_success','creative_rendering','success_rate',0.95,'7d'),
  ('analytics_freshness_minutes','analytics_ingestion','latency_p95_ms',900000,'1d'),
  ('decision_latency_ms','api','latency_p95_ms',2000,'1d'),
  ('api_response_time_ms','api','latency_p95_ms',1500,'1d')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.trpe_settings (id, enabled, config) VALUES (TRUE, TRUE, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
