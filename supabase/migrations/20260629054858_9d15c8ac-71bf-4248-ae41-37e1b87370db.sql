
-- ============ CIE: Conversion Integrity Engine (Genesis V2) ============

-- 1. Sessions
CREATE TABLE public.cie_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  user_id UUID,
  landing_page TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device TEXT,
  country TEXT,
  browser TEXT,
  click_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  utm JSONB NOT NULL DEFAULT '{}'::jsonb,
  referrer TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_sessions TO authenticated;
GRANT ALL ON public.cie_sessions TO service_role;
ALTER TABLE public.cie_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_sessions_admin_all" ON public.cie_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX cie_sessions_started_idx ON public.cie_sessions(started_at DESC);
CREATE INDEX cie_sessions_source_idx ON public.cie_sessions(source);

-- 2. Journey steps
CREATE TABLE public.cie_journey_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  step TEXT NOT NULL,
  step_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok', -- ok | warn | fail | missing
  latency_ms INT,
  page_path TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_journey_steps TO authenticated;
GRANT ALL ON public.cie_journey_steps TO service_role;
ALTER TABLE public.cie_journey_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_journey_admin_all" ON public.cie_journey_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX cie_journey_session_idx ON public.cie_journey_steps(session_id, step_order);

-- 3. Events
CREATE TABLE public.cie_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  session_id TEXT,
  client_id TEXT,
  user_id UUID,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device TEXT,
  country TEXT,
  browser TEXT,
  landing_page TEXT,
  emitted_by TEXT NOT NULL DEFAULT 'client', -- client | server | pixel | ga4 | pinterest | tiktok | meta
  consistency TEXT NOT NULL DEFAULT 'unknown', -- match | mismatch | duplicate | missing | unknown
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_events TO authenticated;
GRANT ALL ON public.cie_events TO service_role;
ALTER TABLE public.cie_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_events_admin_all" ON public.cie_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX cie_events_emitted_idx ON public.cie_events(emitted_at DESC);
CREATE INDEX cie_events_name_idx ON public.cie_events(event_name);

-- 4. Attribution incidents
CREATE TABLE public.cie_attribution_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  expected_source TEXT,
  actual_source TEXT,
  expected_medium TEXT,
  actual_medium TEXT,
  click_id TEXT,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_attribution_incidents TO authenticated;
GRANT ALL ON public.cie_attribution_incidents TO service_role;
ALTER TABLE public.cie_attribution_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_attr_admin_all" ON public.cie_attribution_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 5. Funnel snapshots
CREATE TABLE public.cie_funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  channel TEXT,
  sessions INT NOT NULL DEFAULT 0,
  product_views INT NOT NULL DEFAULT 0,
  add_to_cart INT NOT NULL DEFAULT 0,
  checkout INT NOT NULL DEFAULT 0,
  payment INT NOT NULL DEFAULT 0,
  purchase INT NOT NULL DEFAULT 0,
  cvr NUMERIC(6,4),
  anomalies JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_funnel_snapshots TO authenticated;
GRANT ALL ON public.cie_funnel_snapshots TO service_role;
ALTER TABLE public.cie_funnel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_funnel_admin_all" ON public.cie_funnel_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 6. Root cause AI
CREATE TABLE public.cie_root_cause_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID,
  subject TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_fix TEXT,
  auto_repairable BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_root_cause_analyses TO authenticated;
GRANT ALL ON public.cie_root_cause_analyses TO service_role;
ALTER TABLE public.cie_root_cause_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_rca_admin_all" ON public.cie_root_cause_analyses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 7. Auto repairs
CREATE TABLE public.cie_auto_repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rca_id UUID,
  repair_type TEXT NOT NULL,
  target TEXT,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'applied',
  notes TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_auto_repairs TO authenticated;
GRANT ALL ON public.cie_auto_repairs TO service_role;
ALTER TABLE public.cie_auto_repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_repair_admin_all" ON public.cie_auto_repairs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 8. Health snapshots
CREATE TABLE public.cie_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overall NUMERIC(5,2) NOT NULL DEFAULT 0,
  tracking NUMERIC(5,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(5,2) NOT NULL DEFAULT 0,
  pixel NUMERIC(5,2) NOT NULL DEFAULT 0,
  ga4 NUMERIC(5,2) NOT NULL DEFAULT 0,
  pinterest NUMERIC(5,2) NOT NULL DEFAULT 0,
  tiktok NUMERIC(5,2) NOT NULL DEFAULT 0,
  meta NUMERIC(5,2) NOT NULL DEFAULT 0,
  checkout NUMERIC(5,2) NOT NULL DEFAULT 0,
  purchase NUMERIC(5,2) NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_health_snapshots TO authenticated;
GRANT ALL ON public.cie_health_snapshots TO service_role;
ALTER TABLE public.cie_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_health_admin_all" ON public.cie_health_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 9. Confidence scores (per metric)
CREATE TABLE public.cie_confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL,
  scope TEXT,
  confidence NUMERIC(5,2) NOT NULL,
  gating_ok BOOLEAN NOT NULL DEFAULT false,
  rationale TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(metric, scope)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_confidence_scores TO authenticated;
GRANT ALL ON public.cie_confidence_scores TO service_role;
ALTER TABLE public.cie_confidence_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_conf_admin_all" ON public.cie_confidence_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 10. Synthetic runs
CREATE TABLE public.cie_synthetic_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario TEXT NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT false,
  duration_ms INT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_synthetic_runs TO authenticated;
GRANT ALL ON public.cie_synthetic_runs TO service_role;
ALTER TABLE public.cie_synthetic_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_synth_admin_all" ON public.cie_synthetic_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 11. Revenue truth
CREATE TABLE public.cie_revenue_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  stripe_cents BIGINT NOT NULL DEFAULT 0,
  orders_cents BIGINT NOT NULL DEFAULT 0,
  ga4_cents BIGINT NOT NULL DEFAULT 0,
  pinterest_cents BIGINT NOT NULL DEFAULT 0,
  tiktok_cents BIGINT NOT NULL DEFAULT 0,
  ledger_cents BIGINT NOT NULL DEFAULT 0,
  max_divergence_pct NUMERIC(6,3),
  status TEXT NOT NULL DEFAULT 'ok',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_revenue_truth TO authenticated;
GRANT ALL ON public.cie_revenue_truth TO service_role;
ALTER TABLE public.cie_revenue_truth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_rev_admin_all" ON public.cie_revenue_truth FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 12. Incidents
CREATE TABLE public.cie_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  owner_engine TEXT,
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_incidents TO authenticated;
GRANT ALL ON public.cie_incidents TO service_role;
ALTER TABLE public.cie_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_inc_admin_all" ON public.cie_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 13. Settings
CREATE TABLE public.cie_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autorepair_min_confidence NUMERIC(5,2) NOT NULL DEFAULT 95,
  ai_training_min_confidence NUMERIC(5,2) NOT NULL DEFAULT 90,
  revenue_divergence_tolerance_pct NUMERIC(5,3) NOT NULL DEFAULT 1.0,
  funnel_anomaly_zscore NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  synthetic_enabled BOOLEAN NOT NULL DEFAULT true,
  gating_enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_settings TO authenticated;
GRANT ALL ON public.cie_settings TO service_role;
ALTER TABLE public.cie_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cie_settings_admin_all" ON public.cie_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.cie_settings (id) VALUES (gen_random_uuid());

-- Generic touch trigger
CREATE OR REPLACE FUNCTION public.cie_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER cie_sessions_touch BEFORE UPDATE ON public.cie_sessions
  FOR EACH ROW EXECUTE FUNCTION public.cie_touch_updated_at();
CREATE TRIGGER cie_incidents_touch BEFORE UPDATE ON public.cie_incidents
  FOR EACH ROW EXECUTE FUNCTION public.cie_touch_updated_at();
CREATE TRIGGER cie_settings_touch BEFORE UPDATE ON public.cie_settings
  FOR EACH ROW EXECUTE FUNCTION public.cie_touch_updated_at();
