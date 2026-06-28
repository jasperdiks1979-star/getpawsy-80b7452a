
-- ============ ARIE foundation tables ============

CREATE TABLE public.arie_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE,
  session_id text NOT NULL,
  visitor_id text,
  stage text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  product_id text,
  source text,
  campaign text,
  creative_id text,
  pin_id text,
  tiktok_video_id text,
  device text,
  country text,
  value_cents integer,
  currency text DEFAULT 'USD',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arie_funnel_events_session_idx ON public.arie_funnel_events(session_id, ts);
CREATE INDEX arie_funnel_events_stage_ts_idx ON public.arie_funnel_events(stage, ts DESC);
CREATE INDEX arie_funnel_events_source_idx ON public.arie_funnel_events(source, ts DESC);
GRANT SELECT ON public.arie_funnel_events TO authenticated;
GRANT ALL ON public.arie_funnel_events TO service_role;
ALTER TABLE public.arie_funnel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_funnel_events admin read" ON public.arie_funnel_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  visitor_id text,
  first_touch timestamptz,
  last_touch timestamptz,
  stages_reached text[] NOT NULL DEFAULT '{}',
  time_to_purchase_ms integer,
  revenue_cents integer NOT NULL DEFAULT 0,
  source text,
  campaign text,
  creative_id text,
  pin_id text,
  tiktok_video_id text,
  device text,
  country text,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arie_sessions_source_idx ON public.arie_sessions(source, last_touch DESC);
GRANT SELECT ON public.arie_sessions TO authenticated;
GRANT ALL ON public.arie_sessions TO service_role;
ALTER TABLE public.arie_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_sessions admin read" ON public.arie_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pair text NOT NULL,
  window_label text NOT NULL,
  expected numeric,
  actual numeric,
  drift_pct numeric,
  severity text NOT NULL DEFAULT 'info',
  status text NOT NULL DEFAULT 'ok',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arie_validation_runs_created_idx ON public.arie_validation_runs(created_at DESC);
GRANT SELECT ON public.arie_validation_runs TO authenticated;
GRANT ALL ON public.arie_validation_runs TO service_role;
ALTER TABLE public.arie_validation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_validation_runs admin read" ON public.arie_validation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  confidence numeric NOT NULL DEFAULT 0,
  affected_revenue_cents integer NOT NULL DEFAULT 0,
  affected_sessions integer NOT NULL DEFAULT 0,
  root_cause text,
  suggested_repair text,
  auto_repair_status text NOT NULL DEFAULT 'pending',
  rollback_token text,
  source_pair text,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notes text
);
CREATE INDEX arie_incidents_status_idx ON public.arie_incidents(auto_repair_status, opened_at DESC);
GRANT SELECT ON public.arie_incidents TO authenticated;
GRANT ALL ON public.arie_incidents TO service_role;
ALTER TABLE public.arie_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_incidents admin read" ON public.arie_incidents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.arie_incidents(id) ON DELETE SET NULL,
  category text NOT NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_by text NOT NULL DEFAULT 'arie-auto-fix',
  confidence numeric NOT NULL DEFAULT 0,
  rollback_available boolean NOT NULL DEFAULT true,
  rollback_token text,
  rolled_back_at timestamptz,
  status text NOT NULL DEFAULT 'applied',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arie_repairs_incident_idx ON public.arie_repairs(incident_id);
GRANT SELECT ON public.arie_repairs TO authenticated;
GRANT ALL ON public.arie_repairs TO service_role;
ALTER TABLE public.arie_repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_repairs admin read" ON public.arie_repairs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_synthetic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona text NOT NULL,
  device text NOT NULL,
  browser text,
  route_path text,
  step_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_stage text,
  total_ms integer,
  status text NOT NULL DEFAULT 'pass',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arie_synthetic_runs_created_idx ON public.arie_synthetic_runs(created_at DESC);
GRANT SELECT ON public.arie_synthetic_runs TO authenticated;
GRANT ALL ON public.arie_synthetic_runs TO service_role;
ALTER TABLE public.arie_synthetic_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_synthetic_runs admin read" ON public.arie_synthetic_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  funnel_conversion numeric,
  drop_pcts jsonb NOT NULL DEFAULT '{}'::jsonb,
  pixel_health numeric,
  api_health numeric,
  tracking_health numeric,
  lost_revenue_estimate_cents integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX arie_health_snapshots_ts_idx ON public.arie_health_snapshots(ts DESC);
GRANT SELECT ON public.arie_health_snapshots TO authenticated;
GRANT ALL ON public.arie_health_snapshots TO service_role;
ALTER TABLE public.arie_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_health_snapshots admin read" ON public.arie_health_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arie_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flags jsonb NOT NULL DEFAULT '{"auto_repair":{}}'::jsonb,
  confidence_threshold numeric NOT NULL DEFAULT 0.95,
  alert_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arie_settings TO authenticated;
GRANT ALL ON public.arie_settings TO service_role;
ALTER TABLE public.arie_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arie_settings admin read" ON public.arie_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.arie_settings (feature_flags, confidence_threshold)
VALUES (
  '{"auto_repair":{"metadata.title":false,"metadata.description":false,"metadata.canonical":false,"metadata.og":false,"metadata.pinterest_rich_pin":false,"jsonld.product":false,"utm.repair":false,"tracking.event_dedup":false,"image.fallback_alt":false}}'::jsonb,
  0.95
);
