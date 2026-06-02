
CREATE TABLE IF NOT EXISTS public.hot_product_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  hot_score numeric(5,2) NOT NULL DEFAULT 0,
  intent_score numeric(5,2) NOT NULL DEFAULT 0,
  viral_score numeric(5,2) NOT NULL DEFAULT 0,
  margin_score numeric(5,2) NOT NULL DEFAULT 0,
  pinterest_fit_score numeric(5,2) NOT NULL DEFAULT 0,
  revenue_30d numeric(12,2) NOT NULL DEFAULT 0,
  profit_30d numeric(12,2) NOT NULL DEFAULT 0,
  units_30d integer NOT NULL DEFAULT 0,
  pinterest_impressions_30d integer NOT NULL DEFAULT 0,
  pinterest_clicks_30d integer NOT NULL DEFAULT 0,
  pinterest_saves_30d integer NOT NULL DEFAULT 0,
  recommended_action text,
  auto_promoted boolean NOT NULL DEFAULT false,
  promotion_log jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, day)
);
CREATE INDEX IF NOT EXISTS idx_hps_day_score ON public.hot_product_scores (day DESC, hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_hps_product ON public.hot_product_scores (product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hot_product_scores TO authenticated;
GRANT ALL ON public.hot_product_scores TO service_role;
ALTER TABLE public.hot_product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage hot_product_scores" ON public.hot_product_scores
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.self_improvement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'cron',
  revenue_7d numeric(12,2) NOT NULL DEFAULT 0,
  profit_7d numeric(12,2) NOT NULL DEFAULT 0,
  winners_count integer NOT NULL DEFAULT 0,
  losers_count integer NOT NULL DEFAULT 0,
  actions_taken integer NOT NULL DEFAULT 0,
  pattern_weights_updated integer NOT NULL DEFAULT 0,
  notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sir_started ON public.self_improvement_runs (started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_improvement_runs TO authenticated;
GRANT ALL ON public.self_improvement_runs TO service_role;
ALTER TABLE public.self_improvement_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage self_improvement_runs" ON public.self_improvement_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.self_improvement_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.self_improvement_runs(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_kind text NOT NULL,
  target_ref text NOT NULL,
  reason text,
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sia_run ON public.self_improvement_actions (run_id);
CREATE INDEX IF NOT EXISTS idx_sia_target ON public.self_improvement_actions (target_kind, target_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_improvement_actions TO authenticated;
GRANT ALL ON public.self_improvement_actions TO service_role;
ALTER TABLE public.self_improvement_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage self_improvement_actions" ON public.self_improvement_actions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
