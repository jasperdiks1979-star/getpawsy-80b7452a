
-- 1. Per-visitor geo + intent + revenue scoring (Phase 2)
CREATE TABLE IF NOT EXISTS public.pinterest_visitor_revenue_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  country TEXT,
  region TEXT,
  city TEXT,
  board_id TEXT,
  pin_id TEXT,
  product_id TEXT,
  product_slug TEXT,
  keyword TEXT,
  creative_style TEXT,
  hook_category TEXT,
  session_seconds INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  atc_count INTEGER DEFAULT 0,
  checkout_count INTEGER DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  revenue_score NUMERIC DEFAULT 0,
  traffic_quality_score NUMERIC DEFAULT 0,
  buyer_intent_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pvrs_session ON public.pinterest_visitor_revenue_scores(session_key);
CREATE INDEX IF NOT EXISTS idx_pvrs_visited ON public.pinterest_visitor_revenue_scores(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvrs_country_region ON public.pinterest_visitor_revenue_scores(country, region);
CREATE INDEX IF NOT EXISTS idx_pvrs_product ON public.pinterest_visitor_revenue_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_pvrs_board ON public.pinterest_visitor_revenue_scores(board_id);

GRANT SELECT ON public.pinterest_visitor_revenue_scores TO authenticated;
GRANT ALL ON public.pinterest_visitor_revenue_scores TO service_role;
ALTER TABLE public.pinterest_visitor_revenue_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads pvrs" ON public.pinterest_visitor_revenue_scores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes pvrs" ON public.pinterest_visitor_revenue_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Pinterest-specific forecasts (Phase 12)
CREATE TABLE IF NOT EXISTS public.pinterest_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product','board','keyword','creative','hook')),
  entity_key TEXT NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days IN (7, 30)),
  expected_impressions NUMERIC DEFAULT 0,
  expected_clicks NUMERIC DEFAULT 0,
  expected_conversions NUMERIC DEFAULT 0,
  expected_revenue_cents NUMERIC DEFAULT 0,
  confidence NUMERIC DEFAULT 0,
  model TEXT DEFAULT 'ewma_v1',
  basis_days INTEGER DEFAULT 30,
  rising BOOLEAN DEFAULT false,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_key, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_pf_entity ON public.pinterest_forecasts(entity_type, entity_key);
CREATE INDEX IF NOT EXISTS idx_pf_revenue ON public.pinterest_forecasts(expected_revenue_cents DESC);

GRANT SELECT ON public.pinterest_forecasts TO authenticated;
GRANT ALL ON public.pinterest_forecasts TO service_role;
ALTER TABLE public.pinterest_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads pf" ON public.pinterest_forecasts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes pf" ON public.pinterest_forecasts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Unified opportunity ranks (Phase 3 + 8)
CREATE TABLE IF NOT EXISTS public.pinterest_opportunity_ranks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product','board','keyword','creative','hook')),
  entity_key TEXT NOT NULL,
  opportunity_score NUMERIC NOT NULL DEFAULT 0,
  rank_tier TEXT NOT NULL CHECK (rank_tier IN ('winner','neutral','loser','untested')),
  rank_percentile NUMERIC DEFAULT 0,
  revenue_cents_30d INTEGER DEFAULT 0,
  clicks_30d INTEGER DEFAULT 0,
  ctr_30d NUMERIC DEFAULT 0,
  us_share_30d NUMERIC DEFAULT 0,
  conversion_rate_30d NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_key)
);
CREATE INDEX IF NOT EXISTS idx_por_tier ON public.pinterest_opportunity_ranks(entity_type, rank_tier);
CREATE INDEX IF NOT EXISTS idx_por_score ON public.pinterest_opportunity_ranks(opportunity_score DESC);

GRANT SELECT ON public.pinterest_opportunity_ranks TO authenticated;
GRANT ALL ON public.pinterest_opportunity_ranks TO service_role;
ALTER TABLE public.pinterest_opportunity_ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads por" ON public.pinterest_opportunity_ranks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes por" ON public.pinterest_opportunity_ranks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
