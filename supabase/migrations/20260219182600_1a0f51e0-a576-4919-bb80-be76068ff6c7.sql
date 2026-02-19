
-- V7 Competitive Domination Layer: Database Schema

-- 1. Competitor Gap Intelligence
CREATE TABLE public.competitor_gaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  keyword TEXT NOT NULL,
  competitor_url TEXT,
  competitor_position NUMERIC,
  our_position NUMERIC,
  content_gap_score NUMERIC DEFAULT 0,
  schema_gap JSONB DEFAULT '{}',
  authority_gap NUMERIC DEFAULT 0,
  estimated_gain_if_matched NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_gaps_keyword ON public.competitor_gaps(keyword);
CREATE INDEX idx_competitor_gaps_run_id ON public.competitor_gaps(run_id);
CREATE INDEX idx_competitor_gaps_created ON public.competitor_gaps(created_at DESC);

ALTER TABLE public.competitor_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read competitor_gaps"
  ON public.competitor_gaps FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert competitor_gaps"
  ON public.competitor_gaps FOR INSERT
  WITH CHECK (true);

-- 2. SERP Feature Coverage Tracking
CREATE TABLE public.serp_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  keyword TEXT NOT NULL,
  page_url TEXT,
  feature_type TEXT NOT NULL, -- 'faq', 'paa', 'featured_snippet', 'review_stars', 'product_rich', 'sitelinks'
  status TEXT NOT NULL DEFAULT 'missing', -- 'captured', 'missing', 'eligible'
  impressions INTEGER DEFAULT 0,
  position NUMERIC,
  action_taken TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_serp_features_keyword ON public.serp_features(keyword);
CREATE INDEX idx_serp_features_status ON public.serp_features(status);
CREATE INDEX idx_serp_features_run_id ON public.serp_features(run_id);

ALTER TABLE public.serp_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read serp_features"
  ON public.serp_features FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert serp_features"
  ON public.serp_features FOR INSERT
  WITH CHECK (true);

-- 3. Zero-Click Readiness Tracking
CREATE TABLE public.zero_click_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  slug TEXT,
  zero_click_ready BOOLEAN DEFAULT false,
  has_direct_answer BOOLEAN DEFAULT false,
  has_definition_schema BOOLEAN DEFAULT false,
  has_comparison_table BOOLEAN DEFAULT false,
  has_quick_answer BOOLEAN DEFAULT false,
  visibility_score NUMERIC DEFAULT 0,
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(page_url)
);

CREATE INDEX idx_zero_click_pages_ready ON public.zero_click_pages(zero_click_ready);
CREATE INDEX idx_zero_click_pages_score ON public.zero_click_pages(visibility_score DESC);

ALTER TABLE public.zero_click_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read zero_click_pages"
  ON public.zero_click_pages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert zero_click_pages"
  ON public.zero_click_pages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update zero_click_pages"
  ON public.zero_click_pages FOR UPDATE
  USING (true);

-- 4. Strategy State History (V7 adaptation engine)
CREATE TABLE public.strategy_state_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  ranking_velocity NUMERIC,
  ctr_growth NUMERIC,
  gap_closure_rate NUMERIC,
  cluster_expansion_growth NUMERIC,
  serp_capture_pct NUMERIC,
  strategy_action TEXT, -- 'scale_clusters', 'reduce_cooldown', 'increase_aggressiveness', 'rebalance_links'
  reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategy_state_created ON public.strategy_state_history(created_at DESC);

ALTER TABLE public.strategy_state_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read strategy_state_history"
  ON public.strategy_state_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert strategy_state_history"
  ON public.strategy_state_history FOR INSERT
  WITH CHECK (true);

-- 5. Ranking Defense Status per page
CREATE TABLE public.ranking_defense (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position NUMERIC NOT NULL,
  defense_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'locked', 'alert', 'recovering'
  locked_at TIMESTAMP WITH TIME ZONE,
  last_ctr NUMERIC,
  last_position_drop NUMERIC,
  auto_response_taken TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(page_url, keyword)
);

ALTER TABLE public.ranking_defense ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ranking_defense"
  ON public.ranking_defense FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert ranking_defense"
  ON public.ranking_defense FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update ranking_defense"
  ON public.ranking_defense FOR UPDATE
  USING (true);
