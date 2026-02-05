-- Add enhanced monitoring tables for auto-recovery, root-cause analysis, and conversion tracking

-- Monitoring incidents with detailed root-cause analysis
CREATE TABLE IF NOT EXISTS public.monitoring_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID REFERENCES public.monitoring_alerts(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'P1',
  status TEXT NOT NULL DEFAULT 'open',
  
  -- Root cause analysis
  root_cause_summary TEXT,
  affected_component TEXT,
  affected_files TEXT[],
  recent_changes JSONB DEFAULT '[]'::jsonb,
  
  -- Recovery actions
  auto_action_taken TEXT,
  auto_action_details JSONB,
  rollback_applied BOOLEAN DEFAULT false,
  fallback_activated BOOLEAN DEFAULT false,
  
  -- Timeline
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Evidence
  screenshots JSONB DEFAULT '[]'::jsonb,
  dom_snapshot TEXT,
  network_logs JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-actions log for audit trail
CREATE TABLE IF NOT EXISTS public.monitoring_auto_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES public.monitoring_incidents(id),
  action_type TEXT NOT NULL,
  action_details JSONB NOT NULL,
  target_component TEXT,
  was_successful BOOLEAN DEFAULT true,
  error_message TEXT,
  reverted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Conversion tracking baselines
CREATE TABLE IF NOT EXISTS public.monitoring_conversion_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,
  page_type TEXT NOT NULL,
  baseline_value NUMERIC NOT NULL,
  current_value NUMERIC,
  sample_size INTEGER NOT NULL DEFAULT 0,
  baseline_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  baseline_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(metric_name, page_type)
);

-- Ad landing page registry
CREATE TABLE IF NOT EXISTS public.monitoring_ad_landing_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_path TEXT NOT NULL UNIQUE,
  page_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_check_at TIMESTAMP WITH TIME ZONE,
  last_status TEXT,
  cta_visible BOOLEAN,
  product_visible BOOLEAN,
  load_time_ms INTEGER,
  fallback_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitoring_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_auto_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_conversion_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_ad_landing_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view monitoring incidents" ON public.monitoring_incidents
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage monitoring incidents" ON public.monitoring_incidents
  FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can view auto actions" ON public.monitoring_auto_actions
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage auto actions" ON public.monitoring_auto_actions
  FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can manage conversion baselines" ON public.monitoring_conversion_baselines
  FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can view conversion baselines" ON public.monitoring_conversion_baselines
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage ad landing pages" ON public.monitoring_ad_landing_pages
  FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can manage ad landing pages" ON public.monitoring_ad_landing_pages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed initial ad landing pages
INSERT INTO public.monitoring_ad_landing_pages (url_path, page_type, fallback_url) VALUES
  ('/', 'homepage', '/bestsellers'),
  ('/bestsellers', 'collection', '/products'),
  ('/products', 'collection', '/bestsellers')
ON CONFLICT (url_path) DO NOTHING;