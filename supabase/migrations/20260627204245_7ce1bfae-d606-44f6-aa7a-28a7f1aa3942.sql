
CREATE TABLE public.ai_ceo_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  observe JSONB NOT NULL DEFAULT '{}'::jsonb,
  explain JSONB NOT NULL DEFAULT '{}'::jsonb,
  predict JSONB NOT NULL DEFAULT '{}'::jsonb,
  executive_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual'
);
GRANT SELECT ON public.ai_ceo_runs TO authenticated;
GRANT ALL ON public.ai_ceo_runs TO service_role;
ALTER TABLE public.ai_ceo_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ceo runs" ON public.ai_ceo_runs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service writes ceo runs" ON public.ai_ceo_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.ai_ceo_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.ai_ceo_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_revenue_cents BIGINT NOT NULL DEFAULT 0,
  expected_sales INTEGER NOT NULL DEFAULT 0,
  expected_traffic INTEGER NOT NULL DEFAULT 0,
  impact_score NUMERIC NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0,
  risk NUMERIC NOT NULL DEFAULT 0,
  difficulty NUMERIC NOT NULL DEFAULT 0,
  roi_score NUMERIC NOT NULL DEFAULT 0,
  time_to_result_hours INTEGER NOT NULL DEFAULT 24,
  owner TEXT NOT NULL DEFAULT 'autonomous',
  status TEXT NOT NULL DEFAULT 'proposed',
  dedupe_key TEXT
);
CREATE INDEX idx_ceo_recs_run ON public.ai_ceo_recommendations(run_id);
CREATE INDEX idx_ceo_recs_status_rank ON public.ai_ceo_recommendations(status, rank);
CREATE INDEX idx_ceo_recs_dedupe ON public.ai_ceo_recommendations(dedupe_key) WHERE dedupe_key IS NOT NULL;
GRANT SELECT, UPDATE ON public.ai_ceo_recommendations TO authenticated;
GRANT ALL ON public.ai_ceo_recommendations TO service_role;
ALTER TABLE public.ai_ceo_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ceo recs" ON public.ai_ceo_recommendations FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service manages ceo recs" ON public.ai_ceo_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.ai_ceo_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.ai_ceo_recommendations(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_revenue_cents BIGINT NOT NULL DEFAULT 0,
  actual_revenue_cents BIGINT NOT NULL DEFAULT 0,
  expected_sales INTEGER NOT NULL DEFAULT 0,
  actual_sales INTEGER NOT NULL DEFAULT 0,
  delta_cents BIGINT NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT false,
  lessons TEXT
);
GRANT SELECT ON public.ai_ceo_outcomes TO authenticated;
GRANT ALL ON public.ai_ceo_outcomes TO service_role;
ALTER TABLE public.ai_ceo_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ceo outcomes" ON public.ai_ceo_outcomes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service writes ceo outcomes" ON public.ai_ceo_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.ai_ceo_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE DEFAULT (now() AT TIME ZONE 'utc')::date,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mission_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_10 JSONB NOT NULL DEFAULT '[]'::jsonb,
  executive_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  forecast JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT
);
GRANT SELECT ON public.ai_ceo_daily_reports TO authenticated;
GRANT ALL ON public.ai_ceo_daily_reports TO service_role;
ALTER TABLE public.ai_ceo_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ceo daily" ON public.ai_ceo_daily_reports FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service writes ceo daily" ON public.ai_ceo_daily_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
