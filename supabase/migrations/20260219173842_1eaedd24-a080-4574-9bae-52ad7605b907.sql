
-- V6 Intelligence Layer: CTR Model, Keyword Clusters, Strategy Evolution

-- 1. CTR Model Data — stores position-based CTR expectations from rolling 60-day dataset
CREATE TABLE public.ctr_model_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position INTEGER NOT NULL,
  device TEXT NOT NULL DEFAULT 'all', -- 'mobile', 'desktop', 'all'
  query_type TEXT NOT NULL DEFAULT 'non_brand', -- 'brand', 'non_brand'
  expected_ctr NUMERIC NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  stddev_ctr NUMERIC DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ctr_model_unique ON public.ctr_model_data(position, device, query_type);
CREATE INDEX idx_ctr_model_position ON public.ctr_model_data(position);

ALTER TABLE public.ctr_model_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read ctr_model_data"
  ON public.ctr_model_data FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service write ctr_model_data"
  ON public.ctr_model_data FOR ALL
  USING (true) WITH CHECK (true);

-- 2. Keyword Clusters — semantic groupings of GSC queries
CREATE TABLE public.keyword_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id) ON DELETE SET NULL,
  cluster_label TEXT NOT NULL,
  primary_keyword TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]',
  total_impressions INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  avg_position NUMERIC DEFAULT 0,
  intent_type TEXT DEFAULT 'informational', -- 'informational', 'commercial', 'transactional', 'comparison'
  target_url TEXT,
  orphan_candidates JSONB DEFAULT '[]',
  suggested_new_article BOOLEAN DEFAULT false,
  keyword_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_keyword_clusters_label ON public.keyword_clusters(cluster_label);
CREATE INDEX idx_keyword_clusters_impressions ON public.keyword_clusters(total_impressions DESC);
CREATE INDEX idx_keyword_clusters_run ON public.keyword_clusters(run_id);

ALTER TABLE public.keyword_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read keyword_clusters"
  ON public.keyword_clusters FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service write keyword_clusters"
  ON public.keyword_clusters FOR ALL
  USING (true) WITH CHECK (true);

-- 3. Strategy Evolution Log — tracks self-correcting optimization decisions
CREATE TABLE public.strategy_evolution_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id) ON DELETE SET NULL,
  strategy_type TEXT NOT NULL, -- 'ctr_optimization', 'content_depth', 'internal_linking', 'title_adjustment'
  target_keyword TEXT,
  target_url TEXT,
  action_taken TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  delta_impact JSONB, -- { position_delta, ctr_delta, impressions_delta }
  stability_status TEXT DEFAULT 'stable', -- 'stable', 'improving', 'unstable', 'rolled_back'
  confidence_score NUMERIC DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategy_evolution_run ON public.strategy_evolution_log(run_id);
CREATE INDEX idx_strategy_evolution_type ON public.strategy_evolution_log(strategy_type);
CREATE INDEX idx_strategy_evolution_ts ON public.strategy_evolution_log(created_at DESC);

ALTER TABLE public.strategy_evolution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read strategy_evolution_log"
  ON public.strategy_evolution_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service write strategy_evolution_log"
  ON public.strategy_evolution_log FOR ALL
  USING (true) WITH CHECK (true);
