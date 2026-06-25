
-- AGP Wave 4A+ Growth Intelligence Layer

CREATE TABLE IF NOT EXISTS public.agp_score_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  subscore text NOT NULL,
  prev_value numeric,
  curr_value numeric,
  abs_delta numeric,
  pct_delta numeric,
  reason text,
  confidence numeric,
  business_impact text,
  root_cause text,
  expected_trend text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, subscore)
);
GRANT SELECT ON public.agp_score_explanations TO authenticated;
GRANT ALL ON public.agp_score_explanations TO service_role;
ALTER TABLE public.agp_score_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read score explanations" ON public.agp_score_explanations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_action_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  source text NOT NULL,
  source_id text,
  title text NOT NULL,
  description text,
  revenue_impact numeric DEFAULT 0,
  traffic_impact numeric DEFAULT 0,
  pinterest_impact numeric DEFAULT 0,
  seo_impact numeric DEFAULT 0,
  conversion_impact numeric DEFAULT 0,
  profit_impact numeric DEFAULT 0,
  difficulty numeric DEFAULT 50,
  cloud_cost_usd numeric DEFAULT 0,
  ai_cost_usd numeric DEFAULT 0,
  exec_minutes integer DEFAULT 0,
  confidence numeric DEFAULT 0.5,
  priority_score numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agp_action_priorities_day_score_idx ON public.agp_action_priorities (day, priority_score DESC);
GRANT SELECT ON public.agp_action_priorities TO authenticated;
GRANT ALL ON public.agp_action_priorities TO service_role;
ALTER TABLE public.agp_action_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read action priorities" ON public.agp_action_priorities
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_product_opportunity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  product_id uuid NOT NULL,
  revenue_potential numeric DEFAULT 0,
  pinterest_potential numeric DEFAULT 0,
  seo_potential numeric DEFAULT 0,
  media_quality numeric DEFAULT 0,
  cj_quality numeric DEFAULT 0,
  inventory_health numeric DEFAULT 0,
  competition_risk numeric DEFAULT 0,
  trend_score numeric DEFAULT 0,
  profit_potential numeric DEFAULT 0,
  historical_ctr numeric DEFAULT 0,
  historical_conversion numeric DEFAULT 0,
  expected_roi numeric DEFAULT 0,
  expected_monthly_rev_cents integer DEFAULT 0,
  expected_annual_rev_cents integer DEFAULT 0,
  overall_score numeric DEFAULT 0,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, product_id)
);
CREATE INDEX IF NOT EXISTS agp_product_opportunity_day_rank_idx ON public.agp_product_opportunity (day, rank);
GRANT SELECT ON public.agp_product_opportunity TO authenticated;
GRANT ALL ON public.agp_product_opportunity TO service_role;
ALTER TABLE public.agp_product_opportunity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read product opportunity" ON public.agp_product_opportunity
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_business_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  subscore text NOT NULL,
  narrative_md text,
  suggested_actions jsonb DEFAULT '[]'::jsonb,
  expected_score_after numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, subscore)
);
GRANT SELECT ON public.agp_business_explanations TO authenticated;
GRANT ALL ON public.agp_business_explanations TO service_role;
ALTER TABLE public.agp_business_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read business explanations" ON public.agp_business_explanations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  metric text NOT NULL,
  horizon_days integer NOT NULL,
  predicted numeric,
  low numeric,
  high numeric,
  confidence numeric,
  model text DEFAULT 'ewma_linreg_v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, metric, horizon_days)
);
CREATE INDEX IF NOT EXISTS agp_forecasts_metric_day_idx ON public.agp_forecasts (metric, day DESC);
GRANT SELECT ON public.agp_forecasts TO authenticated;
GRANT ALL ON public.agp_forecasts TO service_role;
ALTER TABLE public.agp_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read forecasts" ON public.agp_forecasts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_daily_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  top_wins jsonb DEFAULT '[]'::jsonb,
  top_problems jsonb DEFAULT '[]'::jsonb,
  biggest_opportunity jsonb,
  biggest_threat jsonb,
  most_profitable_product jsonb,
  fastest_category jsonb,
  worst_category jsonb,
  top_board jsonb,
  top_campaign jsonb,
  top_prompt jsonb,
  top_creative_style jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agp_daily_insights TO authenticated;
GRANT ALL ON public.agp_daily_insights TO service_role;
ALTER TABLE public.agp_daily_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read daily insights" ON public.agp_daily_insights
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_prediction_accuracy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  metric text NOT NULL,
  horizon_days integer NOT NULL,
  predicted numeric,
  actual numeric,
  abs_error numeric,
  pct_error numeric,
  mape_30d numeric,
  weight_adjustment numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, metric, horizon_days)
);
GRANT SELECT ON public.agp_prediction_accuracy TO authenticated;
GRANT ALL ON public.agp_prediction_accuracy TO service_role;
ALTER TABLE public.agp_prediction_accuracy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read prediction accuracy" ON public.agp_prediction_accuracy
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_score_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_day date NOT NULL UNIQUE,
  weights jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agp_score_weights TO authenticated;
GRANT ALL ON public.agp_score_weights TO service_role;
ALTER TABLE public.agp_score_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read score weights" ON public.agp_score_weights
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
