
-- agp_signals_daily: one row per day, all platform KPIs
CREATE TABLE IF NOT EXISTS public.agp_signals_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  -- Pinterest
  pin_impressions bigint DEFAULT 0,
  pin_saves bigint DEFAULT 0,
  pin_clicks bigint DEFAULT 0,
  pin_ctr numeric DEFAULT 0,
  pin_revenue_cents bigint DEFAULT 0,
  pins_published int DEFAULT 0,
  -- GSC
  gsc_clicks bigint DEFAULT 0,
  gsc_impressions bigint DEFAULT 0,
  gsc_ctr numeric DEFAULT 0,
  gsc_avg_position numeric DEFAULT 0,
  -- GA4
  ga_sessions bigint DEFAULT 0,
  ga_atc bigint DEFAULT 0,
  ga_checkouts bigint DEFAULT 0,
  ga_purchases bigint DEFAULT 0,
  ga_revenue_cents bigint DEFAULT 0,
  -- CJ / inventory
  cj_in_stock_pct numeric DEFAULT 0,
  cj_oos_count int DEFAULT 0,
  -- Catalog
  catalog_active int DEFAULT 0,
  catalog_creative_ready_pct numeric DEFAULT 0,
  catalog_media_coverage_pct numeric DEFAULT 0,
  -- CPE
  cpe_jobs_run int DEFAULT 0,
  cpe_spend_usd numeric DEFAULT 0,
  cpe_qa_pass_pct numeric DEFAULT 0,
  -- Cinematic V3
  cv3_renders int DEFAULT 0,
  cv3_success_pct numeric DEFAULT 0,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agp_signals_daily TO authenticated;
GRANT ALL ON public.agp_signals_daily TO service_role;
ALTER TABLE public.agp_signals_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_signals_daily admin read" ON public.agp_signals_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agp_signals_daily admin write" ON public.agp_signals_daily FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_agp_signals_daily_day ON public.agp_signals_daily(day DESC);

-- agp_growth_scores: overall + 13 subscores per day
CREATE TABLE IF NOT EXISTS public.agp_growth_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  overall numeric NOT NULL DEFAULT 0,
  seo numeric DEFAULT 0,
  pinterest numeric DEFAULT 0,
  media numeric DEFAULT 0,
  creative numeric DEFAULT 0,
  conversion numeric DEFAULT 0,
  performance numeric DEFAULT 0,
  product_quality numeric DEFAULT 0,
  catalog_health numeric DEFAULT 0,
  traffic numeric DEFAULT 0,
  revenue numeric DEFAULT 0,
  automation numeric DEFAULT 0,
  ai_efficiency numeric DEFAULT 0,
  trend_direction numeric DEFAULT 0,
  delta_1d numeric DEFAULT 0,
  delta_7d numeric DEFAULT 0,
  delta_30d numeric DEFAULT 0,
  delta_90d numeric DEFAULT 0,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agp_growth_scores TO authenticated;
GRANT ALL ON public.agp_growth_scores TO service_role;
ALTER TABLE public.agp_growth_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_growth_scores admin read" ON public.agp_growth_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agp_growth_scores admin write" ON public.agp_growth_scores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_agp_growth_scores_day ON public.agp_growth_scores(day DESC);

-- agp_product_health: per-product priority and recommended actions
CREATE TABLE IF NOT EXISTS public.agp_product_health (
  product_id uuid PRIMARY KEY,
  computed_at timestamptz NOT NULL DEFAULT now(),
  overall numeric NOT NULL DEFAULT 0,
  media_quality numeric DEFAULT 0,
  pinterest_ready numeric DEFAULT 0,
  seo_ready numeric DEFAULT 0,
  creative_quality numeric DEFAULT 0,
  video_avail boolean DEFAULT false,
  lifestyle_avail boolean DEFAULT false,
  qa_score numeric DEFAULT 0,
  ctr numeric DEFAULT 0,
  cvr numeric DEFAULT 0,
  revenue_30d_cents bigint DEFAULT 0,
  traffic_30d int DEFAULT 0,
  priority_tier text DEFAULT 'C',
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  details jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agp_product_health TO authenticated;
GRANT ALL ON public.agp_product_health TO service_role;
ALTER TABLE public.agp_product_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_product_health admin read" ON public.agp_product_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agp_product_health admin write" ON public.agp_product_health FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_agp_product_health_tier ON public.agp_product_health(priority_tier, overall DESC);
CREATE INDEX IF NOT EXISTS idx_agp_product_health_overall ON public.agp_product_health(overall DESC);
