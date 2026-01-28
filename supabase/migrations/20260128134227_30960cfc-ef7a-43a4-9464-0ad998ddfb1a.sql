-- Create table for AI-generated competitor analysis reports
CREATE TABLE public.competitor_analysis_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type TEXT NOT NULL DEFAULT 'weekly', -- 'weekly', 'monthly', 'trending'
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of insight objects
  pricing_analysis JSONB, -- Pricing strategy insights
  product_trends JSONB, -- Product trend data
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb, -- Actionable recommendations
  competitors_analyzed TEXT[] NOT NULL DEFAULT '{}',
  products_analyzed INTEGER NOT NULL DEFAULT 0,
  generated_by TEXT DEFAULT 'ai',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for competitor pattern alerts
CREATE TABLE public.competitor_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL, -- 'price_drop', 'new_bestseller', 'rising_product', 'competitor_trend'
  competitor TEXT NOT NULL,
  product_name TEXT,
  product_id UUID REFERENCES public.competitor_products(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'urgent'
  data JSONB, -- Additional alert-specific data (price changes, rank changes, etc.)
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_alerts ENABLE ROW LEVEL SECURITY;

-- Policies for competitor_analysis_reports
CREATE POLICY "Admins can view competitor reports"
  ON public.competitor_analysis_reports
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage competitor reports"
  ON public.competitor_analysis_reports
  FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Policies for competitor_alerts
CREATE POLICY "Admins can view competitor alerts"
  ON public.competitor_alerts
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update competitor alerts"
  ON public.competitor_alerts
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage competitor alerts"
  ON public.competitor_alerts
  FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Create indexes for performance
CREATE INDEX idx_competitor_reports_date ON public.competitor_analysis_reports(report_date DESC);
CREATE INDEX idx_competitor_alerts_unread ON public.competitor_alerts(is_read, created_at DESC) WHERE NOT is_dismissed;
CREATE INDEX idx_competitor_alerts_type ON public.competitor_alerts(alert_type, created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_competitor_reports_updated_at
  BEFORE UPDATE ON public.competitor_analysis_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();