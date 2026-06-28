
-- ============================================================
-- PIE: Product Intelligence Engine (Phase 4)
-- ============================================================

-- 1. Per-product metrics rollup (daily snapshot)
CREATE TABLE IF NOT EXISTS public.pie_product_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  outbound int NOT NULL DEFAULT 0,
  atc int NOT NULL DEFAULT 0,
  checkouts int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_cents int NOT NULL DEFAULT 0,
  ctr numeric,
  save_rate numeric,
  conversion_rate numeric,
  roas numeric,
  source text DEFAULT 'aggregate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, metric_date, source)
);
GRANT SELECT ON public.pie_product_metrics TO authenticated;
GRANT ALL ON public.pie_product_metrics TO service_role;
ALTER TABLE public.pie_product_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_metrics_admin_read" ON public.pie_product_metrics FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_metrics_product_date ON public.pie_product_metrics(product_id, metric_date DESC);

-- 2. Master opportunity scores (current state, one row per product)
CREATE TABLE IF NOT EXISTS public.pie_product_scores (
  product_id uuid PRIMARY KEY,
  opportunity_score numeric NOT NULL DEFAULT 0,
  projected_revenue_cents int NOT NULL DEFAULT 0,
  projected_ctr numeric NOT NULL DEFAULT 0,
  projected_conversion numeric NOT NULL DEFAULT 0,
  projected_margin numeric NOT NULL DEFAULT 0,
  demand_score numeric NOT NULL DEFAULT 0,
  trend_score numeric NOT NULL DEFAULT 0,
  seasonality_score numeric NOT NULL DEFAULT 0,
  inventory_safety_score numeric NOT NULL DEFAULT 0,
  novelty_score numeric NOT NULL DEFAULT 0,
  competition_score numeric NOT NULL DEFAULT 0,
  historical_score numeric NOT NULL DEFAULT 0,
  diversity_score numeric NOT NULL DEFAULT 0,
  margin_intelligence jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory_intelligence jsonb NOT NULL DEFAULT '{}'::jsonb,
  trend_intelligence jsonb NOT NULL DEFAULT '{}'::jsonb,
  creative_match jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'neutral',
  block_reasons text[] NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_product_scores TO authenticated;
GRANT ALL ON public.pie_product_scores TO service_role;
ALTER TABLE public.pie_product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_scores_admin_read" ON public.pie_product_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_scores_opp ON public.pie_product_scores(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_pie_scores_tier ON public.pie_product_scores(tier);

-- 3. Score history (audit trail of every recomputation)
CREATE TABLE IF NOT EXISTS public.pie_product_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  opportunity_score numeric NOT NULL,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  tier text,
  run_id uuid,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_product_history TO authenticated;
GRANT ALL ON public.pie_product_history TO service_role;
ALTER TABLE public.pie_product_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_history_admin_read" ON public.pie_product_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_history_product ON public.pie_product_history(product_id, computed_at DESC);

-- 4. Trend signals (Pinterest/Google/seasonal/weather/etc)
CREATE TABLE IF NOT EXISTS public.pie_product_trending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  signal_source text NOT NULL,
  keyword text,
  trend_score numeric NOT NULL DEFAULT 0,
  velocity numeric,
  seasonality_factor numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_product_trending TO authenticated;
GRANT ALL ON public.pie_product_trending TO service_role;
ALTER TABLE public.pie_product_trending ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_trending_admin_read" ON public.pie_product_trending FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_trending_product ON public.pie_product_trending(product_id, captured_at DESC);

-- 5. Revenue / outcome predictions
CREATE TABLE IF NOT EXISTS public.pie_product_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  horizon_days int NOT NULL DEFAULT 7,
  predicted_impressions int NOT NULL DEFAULT 0,
  predicted_clicks int NOT NULL DEFAULT 0,
  predicted_conversions int NOT NULL DEFAULT 0,
  predicted_revenue_cents int NOT NULL DEFAULT 0,
  predicted_profit_cents int NOT NULL DEFAULT 0,
  predicted_roas numeric,
  confidence numeric NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'v1',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_product_predictions TO authenticated;
GRANT ALL ON public.pie_product_predictions TO service_role;
ALTER TABLE public.pie_product_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_pred_admin_read" ON public.pie_product_predictions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_pred_product ON public.pie_product_predictions(product_id, created_at DESC);

-- 6. Promotion decisions (the "should we promote" verdict)
CREATE TABLE IF NOT EXISTS public.pie_promotion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  decision_date date NOT NULL DEFAULT CURRENT_DATE,
  decision text NOT NULL,
  opportunity_score numeric NOT NULL,
  expected_revenue_cents int NOT NULL DEFAULT 0,
  expected_ctr numeric,
  expected_profit_cents int NOT NULL DEFAULT 0,
  expected_risk numeric,
  reasoning text,
  reason_codes text[] NOT NULL DEFAULT '{}',
  channel text NOT NULL DEFAULT 'pinterest',
  scheduled_for timestamptz,
  promoted boolean NOT NULL DEFAULT false,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, decision_date, channel)
);
GRANT SELECT ON public.pie_promotion_decisions TO authenticated;
GRANT ALL ON public.pie_promotion_decisions TO service_role;
ALTER TABLE public.pie_promotion_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_decisions_admin_read" ON public.pie_promotion_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_decisions_date ON public.pie_promotion_decisions(decision_date DESC, opportunity_score DESC);

-- 7. Promotion history (what was actually shipped)
CREATE TABLE IF NOT EXISTS public.pie_promotion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  decision_id uuid REFERENCES public.pie_promotion_decisions(id) ON DELETE SET NULL,
  channel text NOT NULL,
  asset_ref text,
  published_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pie_promotion_history TO authenticated;
GRANT ALL ON public.pie_promotion_history TO service_role;
ALTER TABLE public.pie_promotion_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_promo_hist_admin_read" ON public.pie_promotion_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_promo_hist_product ON public.pie_promotion_history(product_id, published_at DESC);

-- 8. Promotion results (post-publish outcomes)
CREATE TABLE IF NOT EXISTS public.pie_promotion_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid REFERENCES public.pie_promotion_history(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  observed_impressions int NOT NULL DEFAULT 0,
  observed_clicks int NOT NULL DEFAULT 0,
  observed_saves int NOT NULL DEFAULT 0,
  observed_purchases int NOT NULL DEFAULT 0,
  observed_revenue_cents int NOT NULL DEFAULT 0,
  observed_profit_cents int NOT NULL DEFAULT 0,
  prediction_error jsonb,
  measured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_promotion_results TO authenticated;
GRANT ALL ON public.pie_promotion_results TO service_role;
ALTER TABLE public.pie_promotion_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_promo_res_admin_read" ON public.pie_promotion_results FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_promo_res_product ON public.pie_promotion_results(product_id, measured_at DESC);

-- 9. Diversity / rotation ledger
CREATE TABLE IF NOT EXISTS public.pie_diversity_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  dimension text NOT NULL,
  value text NOT NULL,
  promoted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_diversity_ledger TO authenticated;
GRANT ALL ON public.pie_diversity_ledger TO service_role;
ALTER TABLE public.pie_diversity_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_div_admin_read" ON public.pie_diversity_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_div_dim ON public.pie_diversity_ledger(dimension, value, promoted_at DESC);

-- 10. Daily AI meeting (CEO mode briefing)
CREATE TABLE IF NOT EXISTS public.pie_daily_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date NOT NULL DEFAULT CURRENT_DATE UNIQUE,
  products_evaluated int NOT NULL DEFAULT 0,
  winners_selected int NOT NULL DEFAULT 0,
  hidden_gems int NOT NULL DEFAULT 0,
  expected_total_revenue_cents int NOT NULL DEFAULT 0,
  expected_total_profit_cents int NOT NULL DEFAULT 0,
  briefing text,
  rankings jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pie_daily_meetings TO authenticated;
GRANT ALL ON public.pie_daily_meetings TO service_role;
ALTER TABLE public.pie_daily_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_meet_admin_read" ON public.pie_daily_meetings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 11. Marketing calendar (rolling schedule)
CREATE TABLE IF NOT EXISTS public.pie_marketing_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  channel text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  opportunity_score numeric,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel, scheduled_for)
);
GRANT SELECT ON public.pie_marketing_calendar TO authenticated;
GRANT ALL ON public.pie_marketing_calendar TO service_role;
ALTER TABLE public.pie_marketing_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_cal_admin_read" ON public.pie_marketing_calendar FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pie_cal_sched ON public.pie_marketing_calendar(scheduled_for, status);

-- 12. Engine runs (audit)
CREATE TABLE IF NOT EXISTS public.pie_engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  products_scanned int NOT NULL DEFAULT 0,
  decisions_made int NOT NULL DEFAULT 0,
  promotions_scheduled int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.pie_engine_runs TO authenticated;
GRANT ALL ON public.pie_engine_runs TO service_role;
ALTER TABLE public.pie_engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_runs_admin_read" ON public.pie_engine_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 13. Long-term learning weights
CREATE TABLE IF NOT EXISTS public.pie_learning_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weight_key text NOT NULL UNIQUE,
  weight_value numeric NOT NULL DEFAULT 1.0,
  evidence_count int NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pie_learning_weights TO authenticated;
GRANT ALL ON public.pie_learning_weights TO service_role;
ALTER TABLE public.pie_learning_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pie_weights_admin_read" ON public.pie_learning_weights FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Seed default weights for the 12-factor opportunity score
INSERT INTO public.pie_learning_weights(weight_key, weight_value)
VALUES
  ('projected_revenue', 1.0),
  ('projected_ctr', 1.0),
  ('projected_conversion', 1.0),
  ('projected_margin', 1.0),
  ('demand', 1.0),
  ('trend', 1.0),
  ('seasonality', 0.8),
  ('inventory_safety', 1.2),
  ('novelty', 0.6),
  ('competition', 0.8),
  ('historical', 1.0),
  ('diversity', 0.7)
ON CONFLICT (weight_key) DO NOTHING;
