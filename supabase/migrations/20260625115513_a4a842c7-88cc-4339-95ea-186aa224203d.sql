
-- ============================================================
-- Wave 6A: Commander Foundation (observation-only)
-- ============================================================

-- 1. commander_runs
CREATE TABLE IF NOT EXISTS public.commander_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',
  mode text NOT NULL DEFAULT 'observe',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  engines_scanned integer NOT NULL DEFAULT 0,
  alerts_raised integer NOT NULL DEFAULT 0,
  recommendations_created integer NOT NULL DEFAULT 0,
  executive_health_score numeric,
  growth_score numeric,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commander_runs TO service_role;
GRANT SELECT ON public.commander_runs TO authenticated;
ALTER TABLE public.commander_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_runs admin read" ON public.commander_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_runs service write" ON public.commander_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. commander_engine_health
CREATE TABLE IF NOT EXISTS public.commander_engine_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.commander_runs(id) ON DELETE CASCADE,
  engine_key text NOT NULL,
  engine_label text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_run_at timestamptz,
  last_success_at timestamptz,
  age_minutes integer,
  success_rate_24h numeric,
  failures_24h integer NOT NULL DEFAULT 0,
  notes text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmdrf_health_run ON public.commander_engine_health(run_id);
CREATE INDEX IF NOT EXISTS idx_cmdrf_health_engine_time ON public.commander_engine_health(engine_key, created_at DESC);
GRANT ALL ON public.commander_engine_health TO service_role;
GRANT SELECT ON public.commander_engine_health TO authenticated;
ALTER TABLE public.commander_engine_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_engine_health admin read" ON public.commander_engine_health
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_engine_health service write" ON public.commander_engine_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. commander_recommendations
CREATE TABLE IF NOT EXISTS public.commander_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.commander_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  reason text NOT NULL,
  affected_engine text NOT NULL,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  estimated_roi_usd numeric NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  confidence_score numeric NOT NULL DEFAULT 0.5,
  suggested_action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  executed_at timestamptz,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmdrf_recs_status ON public.commander_recommendations(status, created_at DESC);
GRANT ALL ON public.commander_recommendations TO service_role;
GRANT SELECT, UPDATE ON public.commander_recommendations TO authenticated;
ALTER TABLE public.commander_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_recs admin read" ON public.commander_recommendations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_recs admin update" ON public.commander_recommendations
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_recs service write" ON public.commander_recommendations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. commander_decisions
CREATE TABLE IF NOT EXISTS public.commander_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid REFERENCES public.commander_recommendations(id) ON DELETE CASCADE,
  decision text NOT NULL,
  decided_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commander_decisions TO service_role;
GRANT SELECT, INSERT ON public.commander_decisions TO authenticated;
ALTER TABLE public.commander_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_decisions admin read" ON public.commander_decisions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_decisions admin insert" ON public.commander_decisions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. commander_budget_ledger
CREATE TABLE IF NOT EXISTS public.commander_budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  channel text NOT NULL,
  spend_usd numeric NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, channel)
);
GRANT ALL ON public.commander_budget_ledger TO service_role;
GRANT SELECT ON public.commander_budget_ledger TO authenticated;
ALTER TABLE public.commander_budget_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_budget admin read" ON public.commander_budget_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_budget service write" ON public.commander_budget_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. commander_alerts
CREATE TABLE IF NOT EXISTS public.commander_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.commander_runs(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info',
  engine_key text,
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'open',
  dedupe_key text UNIQUE,
  resolved_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmdrf_alerts_status ON public.commander_alerts(status, severity, created_at DESC);
GRANT ALL ON public.commander_alerts TO service_role;
GRANT SELECT, UPDATE ON public.commander_alerts TO authenticated;
ALTER TABLE public.commander_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_alerts admin read" ON public.commander_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_alerts admin update" ON public.commander_alerts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_alerts service write" ON public.commander_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. commander_daily_reports
CREATE TABLE IF NOT EXISTS public.commander_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  run_id uuid REFERENCES public.commander_runs(id) ON DELETE SET NULL,
  pdf_path text,
  json_path text,
  executive_health_score numeric,
  growth_score numeric,
  summary text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commander_daily_reports TO service_role;
GRANT SELECT ON public.commander_daily_reports TO authenticated;
ALTER TABLE public.commander_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commander_reports admin read" ON public.commander_daily_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commander_reports service write" ON public.commander_daily_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Touch updated_at on recommendations + budget ledger
CREATE OR REPLACE FUNCTION public.touch_commander_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cmdrf_recs_touch ON public.commander_recommendations;
CREATE TRIGGER trg_cmdrf_recs_touch BEFORE UPDATE ON public.commander_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.touch_commander_updated_at();

DROP TRIGGER IF EXISTS trg_cmdrf_budget_touch ON public.commander_budget_ledger;
CREATE TRIGGER trg_cmdrf_budget_touch BEFORE UPDATE ON public.commander_budget_ledger
  FOR EACH ROW EXECUTE FUNCTION public.touch_commander_updated_at();
