-- Create monitoring tables for automated health checks

-- Table to track monitoring runs
CREATE TABLE public.monitoring_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT NOT NULL, -- 'p1', 'p2', 'daily_summary'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  success BOOLEAN,
  checks_passed INTEGER DEFAULT 0,
  checks_failed INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to track active alerts (deduplication)
CREATE TABLE public.monitoring_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE, -- Unique identifier for deduplication
  severity TEXT NOT NULL CHECK (severity IN ('P1', 'P2')),
  category TEXT NOT NULL, -- 'category_health', 'product_availability', 'bestseller_url', 'checkout', 'performance', 'broken_image'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_urls TEXT[] DEFAULT '{}',
  suggested_fix TEXT,
  screenshot_url TEXT,
  first_detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX idx_monitoring_alerts_active ON public.monitoring_alerts(is_active, severity);
CREATE INDEX idx_monitoring_alerts_key ON public.monitoring_alerts(alert_key);
CREATE INDEX idx_monitoring_runs_type ON public.monitoring_runs(run_type, started_at DESC);

-- Enable RLS
ALTER TABLE public.monitoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies - admin only
CREATE POLICY "Admins can view monitoring runs"
  ON public.monitoring_runs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage monitoring runs"
  ON public.monitoring_runs FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can view monitoring alerts"
  ON public.monitoring_alerts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update monitoring alerts"
  ON public.monitoring_alerts FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage monitoring alerts"
  ON public.monitoring_alerts FOR ALL
  USING (auth.role() = 'service_role'::text);