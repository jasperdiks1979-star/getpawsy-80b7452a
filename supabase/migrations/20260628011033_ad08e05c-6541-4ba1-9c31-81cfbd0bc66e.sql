
-- SHIL v1 — Self-Healing Intelligence Layer
-- Tables: subsystems, signatures, playbooks, incidents, recoveries, metrics_daily

CREATE TABLE IF NOT EXISTS public.shil_subsystems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL,            -- pinterest|checkout|analytics|infra|creative|commerce
  probe_key text NOT NULL,           -- maps to orchestrator probe handler
  severity text NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  default_playbook text,             -- name of preferred playbook on failure
  enabled boolean NOT NULL DEFAULT true,
  last_status text DEFAULT 'unknown',-- green|yellow|red|unknown
  last_checked_at timestamptz,
  last_evidence jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shil_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_hash text NOT NULL UNIQUE,
  subsystem text NOT NULL,
  symptom text NOT NULL,
  root_cause text,
  preferred_playbook text,
  occurrences int NOT NULL DEFAULT 1,
  confidence numeric NOT NULL DEFAULT 0.5,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  evidence_sample jsonb
);

CREATE TABLE IF NOT EXISTS public.shil_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  handler_key text NOT NULL,         -- static allow-list key inside recoverer
  target_function text,              -- optional edge function to invoke
  description text NOT NULL,
  is_safe boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  preconditions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shil_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem text NOT NULL,
  signature_id uuid REFERENCES public.shil_signatures(id) ON DELETE SET NULL,
  signature_hash text,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open', -- open|recovering|recovered|escalated|failed
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_impact text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  escalated_at timestamptz,
  recovery_id uuid,
  mttd_seconds int,                  -- detect: from underlying signal to detection
  mttr_seconds int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shil_incidents_status_idx ON public.shil_incidents (status, detected_at DESC);
CREATE INDEX IF NOT EXISTS shil_incidents_subsystem_idx ON public.shil_incidents (subsystem, detected_at DESC);

CREATE TABLE IF NOT EXISTS public.shil_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.shil_incidents(id) ON DELETE CASCADE,
  playbook_name text NOT NULL,
  handler_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text DEFAULT 'pending',    -- pending|success|failed|skipped|escalated
  before_state jsonb,
  after_state jsonb,
  validation_passed boolean,
  validation_evidence jsonb,
  error text,
  duration_ms int
);

CREATE INDEX IF NOT EXISTS shil_recoveries_incident_idx ON public.shil_recoveries (incident_id);

CREATE TABLE IF NOT EXISTS public.shil_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  subsystem text NOT NULL,
  incidents_total int NOT NULL DEFAULT 0,
  auto_recovered int NOT NULL DEFAULT 0,
  escalated int NOT NULL DEFAULT 0,
  avg_mttd_seconds numeric,
  avg_mttr_seconds numeric,
  recurring_incidents int NOT NULL DEFAULT 0,
  availability_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, subsystem)
);

-- GRANTS
GRANT SELECT ON public.shil_subsystems   TO authenticated;
GRANT SELECT ON public.shil_signatures   TO authenticated;
GRANT SELECT ON public.shil_playbooks    TO authenticated;
GRANT SELECT ON public.shil_incidents    TO authenticated;
GRANT SELECT ON public.shil_recoveries   TO authenticated;
GRANT SELECT ON public.shil_metrics_daily TO authenticated;
GRANT ALL ON public.shil_subsystems    TO service_role;
GRANT ALL ON public.shil_signatures    TO service_role;
GRANT ALL ON public.shil_playbooks     TO service_role;
GRANT ALL ON public.shil_incidents     TO service_role;
GRANT ALL ON public.shil_recoveries    TO service_role;
GRANT ALL ON public.shil_metrics_daily TO service_role;

-- RLS
ALTER TABLE public.shil_subsystems    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shil_signatures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shil_playbooks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shil_incidents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shil_recoveries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shil_metrics_daily ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT policies (mirrors guardian_* pattern using has_role helper)
CREATE POLICY shil_subsystems_admin_select    ON public.shil_subsystems    FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY shil_signatures_admin_select    ON public.shil_signatures    FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY shil_playbooks_admin_select     ON public.shil_playbooks     FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY shil_incidents_admin_select     ON public.shil_incidents     FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY shil_recoveries_admin_select    ON public.shil_recoveries    FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY shil_metrics_daily_admin_select ON public.shil_metrics_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Service-role unrestricted policy (explicit so PostgREST never blocks server writes)
CREATE POLICY shil_subsystems_service_all    ON public.shil_subsystems    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY shil_signatures_service_all    ON public.shil_signatures    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY shil_playbooks_service_all     ON public.shil_playbooks     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY shil_incidents_service_all     ON public.shil_incidents     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY shil_recoveries_service_all    ON public.shil_recoveries    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY shil_metrics_daily_service_all ON public.shil_metrics_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
