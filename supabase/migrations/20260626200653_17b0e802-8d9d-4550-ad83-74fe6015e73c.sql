
-- ============================================================
-- ACOS Phase 2 — Wave A Foundation
-- 21 new tables, admin-read RLS, service-role write
-- ============================================================

-- Helper: updated_at trigger (reuse existing if available)
CREATE OR REPLACE FUNCTION public.acos_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ------------------------------------------------------------
-- 1. acos_settings
-- ------------------------------------------------------------
CREATE TABLE public.acos_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.acos_settings TO authenticated;
GRANT ALL ON public.acos_settings TO service_role;
ALTER TABLE public.acos_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_settings admin read" ON public.acos_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER acos_settings_touch BEFORE UPDATE ON public.acos_settings FOR EACH ROW EXECUTE FUNCTION public.acos_touch_updated_at();

INSERT INTO public.acos_settings (key, value, description) VALUES
  ('emergency_stop', 'false'::jsonb, 'Master kill switch for all ACOS autonomous actions'),
  ('feature_flags', jsonb_build_object(
      'revenue_brain', true,
      'score_engine', true,
      'winner_detect', true,
      'loser_detect', true,
      'creative_families', false,
      'creative_fatigue', false,
      'pin_seo_ai', false,
      'board_intelligence', false,
      'diversity_engine', false,
      'video_expansion', false,
      'ads_ai', false,
      'landing_ai', false,
      'trend_discovery', true,
      'predictive', true,
      'commander_ai', true,
      'self_learning', false,
      'auto_publish', false,
      'auto_ads_launch', false,
      'auto_ads_scale', false,
      'auto_ads_pause', false
    ), 'Per-engine autonomous toggles. Observation-only when false.'),
  ('budget_caps', jsonb_build_object(
      'daily_ad_usd', 0,
      'weekly_ad_usd', 0,
      'monthly_ad_usd', 0,
      'daily_ai_calls', 5000
    ), 'Hard caps for autonomous spend');

-- ------------------------------------------------------------
-- 2. acos_product_metrics_hourly
-- ------------------------------------------------------------
CREATE TABLE public.acos_product_metrics_hourly (
  id bigserial PRIMARY KEY,
  product_id uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  impressions int DEFAULT 0,
  outbound_clicks int DEFAULT 0,
  ctr numeric DEFAULT 0,
  saves int DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  add_to_cart int DEFAULT 0,
  checkouts_started int DEFAULT 0,
  purchases int DEFAULT 0,
  cvr numeric DEFAULT 0,
  revenue numeric DEFAULT 0,
  gross_profit numeric DEFAULT 0,
  gross_margin numeric DEFAULT 0,
  net_margin numeric DEFAULT 0,
  roas numeric DEFAULT 0,
  cpa numeric DEFAULT 0,
  aov numeric DEFAULT 0,
  rpm numeric DEFAULT 0,
  refund_rate numeric DEFAULT 0,
  inventory_health numeric DEFAULT 0,
  velocity numeric DEFAULT 0,
  trend_score numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  source jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, observed_at)
);
CREATE INDEX acos_pmh_product_time ON public.acos_product_metrics_hourly (product_id, observed_at DESC);
CREATE INDEX acos_pmh_time ON public.acos_product_metrics_hourly (observed_at DESC);
GRANT SELECT ON public.acos_product_metrics_hourly TO authenticated;
GRANT ALL ON public.acos_product_metrics_hourly TO service_role;
ALTER TABLE public.acos_product_metrics_hourly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_pmh admin read" ON public.acos_product_metrics_hourly FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 3. acos_product_forecasts
-- ------------------------------------------------------------
CREATE TABLE public.acos_product_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  horizon text NOT NULL,
  metric text NOT NULL,
  point numeric,
  lo numeric,
  hi numeric,
  confidence numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  features jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX acos_pf_lookup ON public.acos_product_forecasts (product_id, horizon, metric, computed_at DESC);
GRANT SELECT ON public.acos_product_forecasts TO authenticated;
GRANT ALL ON public.acos_product_forecasts TO service_role;
ALTER TABLE public.acos_product_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_pf admin read" ON public.acos_product_forecasts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 4. acos_product_scores
-- ------------------------------------------------------------
CREATE TABLE public.acos_product_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  score numeric NOT NULL,
  category text NOT NULL,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_ps_product_time ON public.acos_product_scores (product_id, computed_at DESC);
CREATE INDEX acos_ps_category ON public.acos_product_scores (category, score DESC);
GRANT SELECT ON public.acos_product_scores TO authenticated;
GRANT ALL ON public.acos_product_scores TO service_role;
ALTER TABLE public.acos_product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_ps admin read" ON public.acos_product_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 5. acos_creative_families
-- ------------------------------------------------------------
CREATE TABLE public.acos_creative_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family text NOT NULL,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_dna jsonb DEFAULT '{}'::jsonb,
  copy_dna jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.acos_creative_families TO authenticated;
GRANT ALL ON public.acos_creative_families TO service_role;
ALTER TABLE public.acos_creative_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_cf admin read" ON public.acos_creative_families FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER acos_cf_touch BEFORE UPDATE ON public.acos_creative_families FOR EACH ROW EXECUTE FUNCTION public.acos_touch_updated_at();

-- ------------------------------------------------------------
-- 6. acos_creative_fatigue
-- ------------------------------------------------------------
CREATE TABLE public.acos_creative_fatigue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_ref text NOT NULL,
  family text,
  fatigue_score numeric NOT NULL DEFAULT 0,
  signals jsonb DEFAULT '{}'::jsonb,
  rotation_action text,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_fatigue_creative ON public.acos_creative_fatigue (creative_ref, detected_at DESC);
GRANT SELECT ON public.acos_creative_fatigue TO authenticated;
GRANT ALL ON public.acos_creative_fatigue TO service_role;
ALTER TABLE public.acos_creative_fatigue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_fatigue admin read" ON public.acos_creative_fatigue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 7. acos_winner_signals
-- ------------------------------------------------------------
CREATE TABLE public.acos_winner_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  signal_type text NOT NULL,
  metric_value numeric,
  rank int,
  recommendation text,
  evidence jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_winner_product_time ON public.acos_winner_signals (product_id, detected_at DESC);
GRANT SELECT ON public.acos_winner_signals TO authenticated;
GRANT ALL ON public.acos_winner_signals TO service_role;
ALTER TABLE public.acos_winner_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_winner admin read" ON public.acos_winner_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 8. acos_loser_signals
-- ------------------------------------------------------------
CREATE TABLE public.acos_loser_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  signal_type text NOT NULL,
  metric_value numeric,
  consecutive_periods int DEFAULT 1,
  recommendation text,
  evidence jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_loser_product_time ON public.acos_loser_signals (product_id, detected_at DESC);
GRANT SELECT ON public.acos_loser_signals TO authenticated;
GRANT ALL ON public.acos_loser_signals TO service_role;
ALTER TABLE public.acos_loser_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_loser admin read" ON public.acos_loser_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 9. acos_pin_seo_variants
-- ------------------------------------------------------------
CREATE TABLE public.acos_pin_seo_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  variant_kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric DEFAULT 0,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_seo_product ON public.acos_pin_seo_variants (product_id, created_at DESC);
GRANT SELECT ON public.acos_pin_seo_variants TO authenticated;
GRANT ALL ON public.acos_pin_seo_variants TO service_role;
ALTER TABLE public.acos_pin_seo_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_seo admin read" ON public.acos_pin_seo_variants FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 10. acos_board_intelligence
-- ------------------------------------------------------------
CREATE TABLE public.acos_board_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id text NOT NULL,
  board_name text,
  ctr numeric DEFAULT 0,
  saves int DEFAULT 0,
  traffic int DEFAULT 0,
  conversions int DEFAULT 0,
  frequency numeric DEFAULT 0,
  diversity_score numeric DEFAULT 0,
  suggestion text,
  detail jsonb DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_board_board_time ON public.acos_board_intelligence (board_id, computed_at DESC);
GRANT SELECT ON public.acos_board_intelligence TO authenticated;
GRANT ALL ON public.acos_board_intelligence TO service_role;
ALTER TABLE public.acos_board_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_board admin read" ON public.acos_board_intelligence FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 11. acos_diversity_state
-- ------------------------------------------------------------
CREATE TABLE public.acos_diversity_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  window_start timestamptz NOT NULL,
  exposure_count int DEFAULT 0,
  target_share numeric DEFAULT 0,
  actual_share numeric DEFAULT 0,
  delta numeric DEFAULT 0,
  recommendation text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_div_cat_time ON public.acos_diversity_state (category, computed_at DESC);
GRANT SELECT ON public.acos_diversity_state TO authenticated;
GRANT ALL ON public.acos_diversity_state TO service_role;
ALTER TABLE public.acos_diversity_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_div admin read" ON public.acos_diversity_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 12. acos_video_expansion_jobs
-- ------------------------------------------------------------
CREATE TABLE public.acos_video_expansion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  duration_sec int NOT NULL,
  aspect_ratio text NOT NULL,
  voiceover boolean DEFAULT false,
  status text NOT NULL DEFAULT 'queued',
  upstream_job_ref text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_vex_status ON public.acos_video_expansion_jobs (status, created_at);
GRANT SELECT ON public.acos_video_expansion_jobs TO authenticated;
GRANT ALL ON public.acos_video_expansion_jobs TO service_role;
ALTER TABLE public.acos_video_expansion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_vex admin read" ON public.acos_video_expansion_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER acos_vex_touch BEFORE UPDATE ON public.acos_video_expansion_jobs FOR EACH ROW EXECUTE FUNCTION public.acos_touch_updated_at();

-- ------------------------------------------------------------
-- 13. acos_ads_recommendations
-- ------------------------------------------------------------
CREATE TABLE public.acos_ads_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  pin_ref text,
  action text NOT NULL,
  current_budget numeric,
  recommended_budget numeric,
  reason text,
  evidence jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_ads_status ON public.acos_ads_recommendations (status, created_at DESC);
GRANT SELECT ON public.acos_ads_recommendations TO authenticated;
GRANT ALL ON public.acos_ads_recommendations TO service_role;
ALTER TABLE public.acos_ads_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_ads admin read" ON public.acos_ads_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 14. acos_landing_audits
-- ------------------------------------------------------------
CREATE TABLE public.acos_landing_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  url text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb DEFAULT '[]'::jsonb,
  auto_applied jsonb DEFAULT '[]'::jsonb,
  pending_approval jsonb DEFAULT '[]'::jsonb,
  audited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_la_product ON public.acos_landing_audits (product_id, audited_at DESC);
GRANT SELECT ON public.acos_landing_audits TO authenticated;
GRANT ALL ON public.acos_landing_audits TO service_role;
ALTER TABLE public.acos_landing_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_la admin read" ON public.acos_landing_audits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 15. acos_trend_opportunities
-- ------------------------------------------------------------
CREATE TABLE public.acos_trend_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  topic text NOT NULL,
  category text,
  momentum numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  suggested_products jsonb DEFAULT '[]'::jsonb,
  suggested_campaigns jsonb DEFAULT '[]'::jsonb,
  raw jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_trend_source_time ON public.acos_trend_opportunities (source, detected_at DESC);
GRANT SELECT ON public.acos_trend_opportunities TO authenticated;
GRANT ALL ON public.acos_trend_opportunities TO service_role;
ALTER TABLE public.acos_trend_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_trend admin read" ON public.acos_trend_opportunities FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 16. acos_predictions
-- ------------------------------------------------------------
CREATE TABLE public.acos_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  scope_ref text,
  metric text NOT NULL,
  horizon text NOT NULL,
  point numeric,
  lo numeric,
  hi numeric,
  confidence numeric,
  method text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_pred_lookup ON public.acos_predictions (scope, metric, horizon, computed_at DESC);
GRANT SELECT ON public.acos_predictions TO authenticated;
GRANT ALL ON public.acos_predictions TO service_role;
ALTER TABLE public.acos_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_pred admin read" ON public.acos_predictions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 17. acos_commander_chats
-- ------------------------------------------------------------
CREATE TABLE public.acos_commander_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  question text NOT NULL,
  answer text,
  citations jsonb DEFAULT '[]'::jsonb,
  data_snapshot jsonb DEFAULT '{}'::jsonb,
  model text,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_chat_time ON public.acos_commander_chats (created_at DESC);
GRANT SELECT ON public.acos_commander_chats TO authenticated;
GRANT ALL ON public.acos_commander_chats TO service_role;
ALTER TABLE public.acos_commander_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_chat admin read" ON public.acos_commander_chats FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 18. acos_decisions
-- ------------------------------------------------------------
CREATE TABLE public.acos_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  action text NOT NULL,
  target_kind text,
  target_ref text,
  reason text,
  expected_outcome jsonb DEFAULT '{}'::jsonb,
  actual_outcome jsonb DEFAULT '{}'::jsonb,
  delta jsonb DEFAULT '{}'::jsonb,
  rollback_ref text,
  status text NOT NULL DEFAULT 'recorded',
  observed_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz
);
CREATE INDEX acos_dec_engine_time ON public.acos_decisions (engine, created_at DESC);
CREATE INDEX acos_dec_status ON public.acos_decisions (status, created_at DESC);
GRANT SELECT ON public.acos_decisions TO authenticated;
GRANT ALL ON public.acos_decisions TO service_role;
ALTER TABLE public.acos_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_dec admin read" ON public.acos_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 19. acos_learning_insights
-- ------------------------------------------------------------
CREATE TABLE public.acos_learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  value text NOT NULL,
  metric text NOT NULL,
  uplift numeric,
  sample_size int,
  confidence numeric,
  evidence jsonb DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acos_learn_dim ON public.acos_learning_insights (dimension, metric, computed_at DESC);
GRANT SELECT ON public.acos_learning_insights TO authenticated;
GRANT ALL ON public.acos_learning_insights TO service_role;
ALTER TABLE public.acos_learning_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_learn admin read" ON public.acos_learning_insights FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 20. acos_orchestrator_runs
-- ------------------------------------------------------------
CREATE TABLE public.acos_orchestrator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  summary jsonb DEFAULT '{}'::jsonb,
  error text
);
CREATE INDEX acos_runs_time ON public.acos_orchestrator_runs (started_at DESC);
GRANT SELECT ON public.acos_orchestrator_runs TO authenticated;
GRANT ALL ON public.acos_orchestrator_runs TO service_role;
ALTER TABLE public.acos_orchestrator_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_runs admin read" ON public.acos_orchestrator_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 21. acos_orchestrator_steps
-- ------------------------------------------------------------
CREATE TABLE public.acos_orchestrator_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.acos_orchestrator_runs(id) ON DELETE CASCADE,
  engine text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  rows_written int,
  detail jsonb DEFAULT '{}'::jsonb,
  error text
);
CREATE INDEX acos_steps_run ON public.acos_orchestrator_steps (run_id, started_at);
GRANT SELECT ON public.acos_orchestrator_steps TO authenticated;
GRANT ALL ON public.acos_orchestrator_steps TO service_role;
ALTER TABLE public.acos_orchestrator_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acos_steps admin read" ON public.acos_orchestrator_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
