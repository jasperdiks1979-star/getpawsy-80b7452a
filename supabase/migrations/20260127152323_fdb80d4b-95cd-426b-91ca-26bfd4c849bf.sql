-- Create table for crawler visit logs
CREATE TABLE public.crawler_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  is_googlebot BOOLEAN NOT NULL DEFAULT false,
  bot_type TEXT,
  ip_address TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crawler_visits ENABLE ROW LEVEL SECURITY;

-- Admins can view all crawler visits
CREATE POLICY "Admins can view crawler visits"
  ON public.crawler_visits FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert crawler visits
CREATE POLICY "Service role can manage crawler visits"
  ON public.crawler_visits FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Anyone can insert (edge function uses service role, but allow public insert too)
CREATE POLICY "Anyone can log crawler visits"
  ON public.crawler_visits FOR INSERT
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_crawler_visits_created_at ON public.crawler_visits(created_at DESC);
CREATE INDEX idx_crawler_visits_is_googlebot ON public.crawler_visits(is_googlebot) WHERE is_googlebot = true;