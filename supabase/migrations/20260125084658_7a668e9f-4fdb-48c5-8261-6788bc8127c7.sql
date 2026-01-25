-- Create table for storing performance metrics over time
CREATE TABLE public.performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  page_url TEXT,
  session_id TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_performance_metrics_created_at ON public.performance_metrics(created_at DESC);
CREATE INDEX idx_performance_metrics_name ON public.performance_metrics(metric_name);
CREATE INDEX idx_performance_metrics_rating ON public.performance_metrics(rating);

-- Enable RLS
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- Anyone can insert metrics (for frontend reporting)
CREATE POLICY "Anyone can insert performance metrics"
ON public.performance_metrics
FOR INSERT
WITH CHECK (true);

-- Only admins can view metrics
CREATE POLICY "Admins can view performance metrics"
ON public.performance_metrics
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create table for performance alerts
CREATE TABLE public.performance_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,
  threshold_type TEXT NOT NULL CHECK (threshold_type IN ('warning', 'critical')),
  current_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 1,
  notified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.performance_alerts ENABLE ROW LEVEL SECURITY;

-- Service role can manage alerts
CREATE POLICY "Service role can manage performance alerts"
ON public.performance_alerts
FOR ALL
USING (auth.role() = 'service_role'::text);

-- Admins can view alerts
CREATE POLICY "Admins can view performance alerts"
ON public.performance_alerts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));