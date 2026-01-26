-- Create table for tracked keywords
CREATE TABLE public.keyword_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  position NUMERIC,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr NUMERIC,
  country TEXT DEFAULT 'usa',
  device TEXT DEFAULT 'all',
  tracked_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(keyword, country, device, tracked_date)
);

-- Create table for competitor tracking
CREATE TABLE public.competitor_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  competitor_domain TEXT NOT NULL,
  position NUMERIC,
  tracked_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(keyword, competitor_domain, tracked_date)
);

-- Create table for manual keyword watchlist
CREATE TABLE public.keyword_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  added_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_watchlist ENABLE ROW LEVEL SECURITY;

-- RLS policies for keyword_rankings
CREATE POLICY "Admins can view keyword rankings"
ON public.keyword_rankings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage keyword rankings"
ON public.keyword_rankings FOR ALL
USING (auth.role() = 'service_role'::text);

-- RLS policies for competitor_rankings
CREATE POLICY "Admins can view competitor rankings"
ON public.competitor_rankings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage competitor rankings"
ON public.competitor_rankings FOR ALL
USING (auth.role() = 'service_role'::text);

-- RLS policies for keyword_watchlist
CREATE POLICY "Admins can view watchlist"
ON public.keyword_watchlist FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert watchlist"
ON public.keyword_watchlist FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update watchlist"
ON public.keyword_watchlist FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete watchlist"
ON public.keyword_watchlist FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_keyword_rankings_date ON public.keyword_rankings(tracked_date DESC);
CREATE INDEX idx_keyword_rankings_keyword ON public.keyword_rankings(keyword);
CREATE INDEX idx_competitor_rankings_date ON public.competitor_rankings(tracked_date DESC);