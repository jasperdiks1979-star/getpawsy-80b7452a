
-- Ranking Delta Monitor: track keyword position/impression/CTR changes between runs
CREATE TABLE public.ranking_deltas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.job_runs(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  page_url TEXT,
  position_before NUMERIC,
  position_after NUMERIC,
  impressions_before INTEGER,
  impressions_after INTEGER,
  ctr_before NUMERIC,
  ctr_after NUMERIC,
  delta_position NUMERIC GENERATED ALWAYS AS (position_after - position_before) STORED,
  delta_impressions INTEGER GENERATED ALWAYS AS (impressions_after - impressions_before) STORED,
  delta_ctr NUMERIC GENERATED ALWAYS AS (ctr_after - ctr_before) STORED,
  volatility_score NUMERIC DEFAULT 0,
  crawl_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_ranking_deltas_keyword ON public.ranking_deltas(keyword);
CREATE INDEX idx_ranking_deltas_crawl_ts ON public.ranking_deltas(crawl_timestamp DESC);
CREATE INDEX idx_ranking_deltas_run ON public.ranking_deltas(run_id);

-- Enable RLS (admin-only access)
ALTER TABLE public.ranking_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read ranking_deltas"
  ON public.ranking_deltas FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service insert ranking_deltas"
  ON public.ranking_deltas FOR INSERT
  WITH CHECK (true);
