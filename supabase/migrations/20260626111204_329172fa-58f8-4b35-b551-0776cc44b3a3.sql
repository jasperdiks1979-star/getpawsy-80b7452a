-- PAIP v1 Wave A: Intelligence Layer
-- Additive tables for trend, visual, emotion, SEO, competitor, ranking intelligence.
-- Admin-only RLS via has_role. Service-role full access for edge functions.

-- 1. Trend database
CREATE TABLE IF NOT EXISTS public.paip_trend_database (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  source text NOT NULL,
  niche text,
  volume integer,
  growth_pct numeric,
  competition_score numeric,
  seasonality_window text,
  trend_score numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paip_trend_db_keyword ON public.paip_trend_database (keyword);
CREATE INDEX IF NOT EXISTS idx_paip_trend_db_captured ON public.paip_trend_database (captured_at DESC);
GRANT SELECT ON public.paip_trend_database TO authenticated;
GRANT ALL ON public.paip_trend_database TO service_role;
ALTER TABLE public.paip_trend_database ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_trend_db_admin_read" ON public.paip_trend_database FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Product trend scores
CREATE TABLE IF NOT EXISTS public.paip_product_trend_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  trend_score numeric DEFAULT 0,
  search_opportunity numeric DEFAULT 0,
  competition numeric DEFAULT 0,
  seasonality numeric DEFAULT 0,
  demand_forecast_30d numeric DEFAULT 0,
  matched_keywords jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
CREATE INDEX IF NOT EXISTS idx_paip_pts_product ON public.paip_product_trend_scores (product_id);
CREATE INDEX IF NOT EXISTS idx_paip_pts_score ON public.paip_product_trend_scores (trend_score DESC);
GRANT SELECT ON public.paip_product_trend_scores TO authenticated;
GRANT ALL ON public.paip_product_trend_scores TO service_role;
ALTER TABLE public.paip_product_trend_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_pts_admin_read" ON public.paip_product_trend_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Visual attention
CREATE TABLE IF NOT EXISTS public.paip_visual_attention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  image_hash text,
  attention_score numeric,
  attention_map jsonb DEFAULT '{}'::jsonb,
  complexity numeric,
  focal_points jsonb DEFAULT '[]'::jsonb,
  golden_ratio numeric,
  rule_of_thirds numeric,
  whitespace numeric,
  product_prominence numeric,
  contrast numeric,
  color_harmony numeric,
  depth_score numeric,
  artifact_probability numeric,
  face_visibility numeric,
  pet_emotion_score numeric,
  visual_uniqueness numeric,
  confidence numeric,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (image_url)
);
CREATE INDEX IF NOT EXISTS idx_paip_va_score ON public.paip_visual_attention (attention_score DESC);
GRANT SELECT ON public.paip_visual_attention TO authenticated;
GRANT ALL ON public.paip_visual_attention TO service_role;
ALTER TABLE public.paip_visual_attention ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_va_admin_read" ON public.paip_visual_attention FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. Emotion scores
CREATE TABLE IF NOT EXISTS public.paip_emotion_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid,
  image_url text,
  headline text,
  curiosity numeric, joy numeric, fear numeric, relief numeric, urgency numeric,
  excitement numeric, trust numeric, luxury numeric, comfort numeric, love numeric,
  pet_happiness numeric, owner_happiness numeric, viral_emotion numeric,
  dominant_emotion text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paip_emo_creative ON public.paip_emotion_scores (creative_id);
GRANT SELECT ON public.paip_emotion_scores TO authenticated;
GRANT ALL ON public.paip_emotion_scores TO service_role;
ALTER TABLE public.paip_emotion_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_emo_admin_read" ON public.paip_emotion_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. SEO scores
CREATE TABLE IF NOT EXISTS public.paip_seo_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid,
  title text,
  description text,
  title_score numeric, desc_score numeric,
  keyword_density numeric, lsi_coverage numeric,
  entity_match numeric, semantic_relevance numeric,
  board_relevance numeric, intent text,
  final_score numeric, reasons jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paip_seo_creative ON public.paip_seo_scores (creative_id);
CREATE INDEX IF NOT EXISTS idx_paip_seo_score ON public.paip_seo_scores (final_score DESC);
GRANT SELECT ON public.paip_seo_scores TO authenticated;
GRANT ALL ON public.paip_seo_scores TO service_role;
ALTER TABLE public.paip_seo_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_seo_admin_read" ON public.paip_seo_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. Competitor signals (pattern-only, no asset copy)
CREATE TABLE IF NOT EXISTS public.paip_competitor_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor text NOT NULL,
  niche text,
  color_palette jsonb DEFAULT '[]'::jsonb,
  headline_pattern text,
  composition text,
  cta_pattern text,
  psychology_tag text,
  advantage_score numeric,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paip_comp_niche ON public.paip_competitor_signals (niche);
GRANT SELECT ON public.paip_competitor_signals TO authenticated;
GRANT ALL ON public.paip_competitor_signals TO service_role;
ALTER TABLE public.paip_competitor_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_comp_admin_read" ON public.paip_competitor_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. Product daily ranking
CREATE TABLE IF NOT EXISTS public.paip_product_daily_rank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  run_date date NOT NULL DEFAULT current_date,
  composite_score numeric DEFAULT 0,
  components jsonb DEFAULT '{}'::jsonb,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, run_date)
);
CREATE INDEX IF NOT EXISTS idx_paip_pdr_date_rank ON public.paip_product_daily_rank (run_date, rank);
GRANT SELECT ON public.paip_product_daily_rank TO authenticated;
GRANT ALL ON public.paip_product_daily_rank TO service_role;
ALTER TABLE public.paip_product_daily_rank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_pdr_admin_read" ON public.paip_product_daily_rank FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. Run audit log (shared across PAIP edge functions)
CREATE TABLE IF NOT EXISTS public.paip_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  stats jsonb DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_paip_runs_engine ON public.paip_runs (engine, started_at DESC);
GRANT SELECT ON public.paip_runs TO authenticated;
GRANT ALL ON public.paip_runs TO service_role;
ALTER TABLE public.paip_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_runs_admin_read" ON public.paip_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 9. Global settings singleton
CREATE TABLE IF NOT EXISTS public.paip_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  brain_enabled boolean DEFAULT false,
  v3_firewall_enabled boolean DEFAULT false,
  trend_threshold numeric DEFAULT 30,
  visual_threshold numeric DEFAULT 60,
  emotion_threshold numeric DEFAULT 50,
  seo_threshold numeric DEFAULT 55,
  conversion_threshold numeric DEFAULT 0.4,
  human_authenticity_threshold numeric DEFAULT 0.6,
  daily_ai_budget_usd numeric DEFAULT 75,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paip_settings TO authenticated;
GRANT ALL ON public.paip_settings TO service_role;
ALTER TABLE public.paip_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paip_settings_admin_read" ON public.paip_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.paip_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;