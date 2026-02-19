
-- V8 Enterprise Autonomous Domination Mode: Database Schema

-- 1. Competitor Content Intelligence
CREATE TABLE public.competitor_content_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  keyword TEXT NOT NULL,
  competitor_url TEXT,
  structural_advantage_score NUMERIC DEFAULT 0,
  semantic_gap_score NUMERIC DEFAULT 0,
  schema_gap JSONB DEFAULT '{}',
  content_depth_delta NUMERIC DEFAULT 0,
  snippet_format_presence BOOLEAN DEFAULT false,
  actionable_improvements JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_cci_keyword ON public.competitor_content_intelligence(keyword);
CREATE INDEX idx_cci_run_id ON public.competitor_content_intelligence(run_id);
CREATE INDEX idx_cci_score ON public.competitor_content_intelligence(structural_advantage_score DESC);

ALTER TABLE public.competitor_content_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read competitor_content_intelligence"
  ON public.competitor_content_intelligence FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert competitor_content_intelligence"
  ON public.competitor_content_intelligence FOR INSERT
  WITH CHECK (true);

-- 2. Backlink Outreach Scoring
CREATE TABLE public.backlink_outreach_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  target_domain TEXT NOT NULL,
  authority_score NUMERIC DEFAULT 0,
  relevance_score NUMERIC DEFAULT 0,
  outreach_priority_score NUMERIC DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'C',
  suggested_pitch_topic TEXT,
  recommended_anchor_type TEXT,
  spam_risk NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_bos_priority ON public.backlink_outreach_scores(outreach_priority_score DESC);
CREATE INDEX idx_bos_tier ON public.backlink_outreach_scores(tier);
CREATE INDEX idx_bos_run_id ON public.backlink_outreach_scores(run_id);

ALTER TABLE public.backlink_outreach_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backlink_outreach_scores"
  ON public.backlink_outreach_scores FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert backlink_outreach_scores"
  ON public.backlink_outreach_scores FOR INSERT
  WITH CHECK (true);

-- 3. SEO Revenue Matrix
CREATE TABLE public.seo_revenue_matrix (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  keyword TEXT NOT NULL,
  page_url TEXT,
  current_position NUMERIC,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  estimated_cvr NUMERIC DEFAULT 0.015,
  aov NUMERIC DEFAULT 35,
  revenue_potential_30d NUMERIC DEFAULT 0,
  revenue_potential_90d NUMERIC DEFAULT 0,
  action_taken TEXT,
  defense_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_srm_revenue ON public.seo_revenue_matrix(revenue_potential_90d DESC);
CREATE INDEX idx_srm_keyword ON public.seo_revenue_matrix(keyword);
CREATE INDEX idx_srm_run_id ON public.seo_revenue_matrix(run_id);

ALTER TABLE public.seo_revenue_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read seo_revenue_matrix"
  ON public.seo_revenue_matrix FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert seo_revenue_matrix"
  ON public.seo_revenue_matrix FOR INSERT
  WITH CHECK (true);

-- 4. Market Share Simulation History
CREATE TABLE public.market_share_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id),
  scenario TEXT NOT NULL,
  projected_traffic_90d NUMERIC DEFAULT 0,
  projected_revenue_90d NUMERIC DEFAULT 0,
  projected_market_share_gain NUMERIC DEFAULT 0,
  cluster_expansion_growth NUMERIC DEFAULT 0,
  serp_capture_growth NUMERIC DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0,
  top3_share_pct NUMERIC DEFAULT 0,
  top10_share_pct NUMERIC DEFAULT 0,
  competitive_pressure NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_mss_scenario ON public.market_share_simulations(scenario);
CREATE INDEX idx_mss_run_id ON public.market_share_simulations(run_id);

ALTER TABLE public.market_share_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read market_share_simulations"
  ON public.market_share_simulations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert market_share_simulations"
  ON public.market_share_simulations FOR INSERT
  WITH CHECK (true);
