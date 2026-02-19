
-- New table for real query-level GSC data (Phase 1)
CREATE TABLE public.gsc_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  sync_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(query, page, sync_date)
);

-- Index for Yellow Zone filtering
CREATE INDEX idx_gsc_keywords_position ON public.gsc_keywords (position);
CREATE INDEX idx_gsc_keywords_impressions ON public.gsc_keywords (impressions);
CREATE INDEX idx_gsc_keywords_sync_date ON public.gsc_keywords (sync_date DESC);
CREATE INDEX idx_gsc_keywords_query ON public.gsc_keywords (query);

-- Enable RLS
ALTER TABLE public.gsc_keywords ENABLE ROW LEVEL SECURITY;

-- Admin-only read policy
CREATE POLICY "Admins can read gsc_keywords"
  ON public.gsc_keywords
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert/update (edge functions use service role)
CREATE POLICY "Service role full access on gsc_keywords"
  ON public.gsc_keywords
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_gsc_keywords_updated_at
  BEFORE UPDATE ON public.gsc_keywords
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
