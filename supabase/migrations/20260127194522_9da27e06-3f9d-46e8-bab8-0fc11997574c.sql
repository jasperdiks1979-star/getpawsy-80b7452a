-- Create table for competitor product rankings from scraped data
CREATE TABLE public.competitor_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor TEXT NOT NULL, -- 'amazon', 'chewy', 'petco'
  product_name TEXT NOT NULL,
  product_url TEXT,
  product_image TEXT,
  current_rank INTEGER NOT NULL,
  previous_rank INTEGER,
  price NUMERIC,
  category TEXT DEFAULT 'pet-supplies',
  trend TEXT DEFAULT 'stable', -- 'up', 'down', 'stable', 'new'
  rank_change INTEGER DEFAULT 0,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_competitor_products_competitor ON public.competitor_products(competitor);
CREATE INDEX idx_competitor_products_rank ON public.competitor_products(current_rank);
CREATE INDEX idx_competitor_products_trend ON public.competitor_products(trend);

-- Enable RLS
ALTER TABLE public.competitor_products ENABLE ROW LEVEL SECURITY;

-- Admins can view competitor products
CREATE POLICY "Admins can view competitor products"
  ON public.competitor_products FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage competitor products
CREATE POLICY "Service role can manage competitor products"
  ON public.competitor_products FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Create table for tracking scrape history
CREATE TABLE public.competitor_scrape_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  products_found INTEGER DEFAULT 0,
  error_message TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_scrape_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view scrape logs
CREATE POLICY "Admins can view scrape logs"
  ON public.competitor_scrape_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage scrape logs
CREATE POLICY "Service role can manage scrape logs"
  ON public.competitor_scrape_logs FOR ALL
  USING (auth.role() = 'service_role'::text);