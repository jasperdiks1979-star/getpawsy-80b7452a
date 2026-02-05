-- Predictive alerts table for pre-NO-GO warnings
CREATE TABLE public.monitoring_predictive_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  alert_type TEXT NOT NULL, -- 'risk_warning', 'threshold_breach'
  severity TEXT NOT NULL DEFAULT 'warning', -- 'warning', 'critical'
  risk_level TEXT NOT NULL, -- 'low', 'medium', 'high'
  estimated_hours_to_nogo INTEGER,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of triggering indicators
  affected_urls TEXT[] DEFAULT '{}',
  affected_components TEXT[] DEFAULT '{}',
  recommended_actions TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_reason TEXT
);

-- Budget taper actions table
CREATE TABLE public.monitoring_budget_tapers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  platform TEXT NOT NULL, -- 'google_ads', 'pinterest', 'meta'
  trigger_type TEXT NOT NULL, -- 'predictive_alert', 'caution_status'
  trigger_id UUID, -- Reference to predictive alert or go_nogo run
  original_budget_percent INTEGER NOT NULL DEFAULT 100,
  tapered_budget_percent INTEGER NOT NULL,
  taper_reason TEXT NOT NULL,
  affected_urls TEXT[] DEFAULT '{}',
  campaign_ids TEXT[] DEFAULT '{}',
  is_recommendation BOOLEAN NOT NULL DEFAULT true,
  executed_at TIMESTAMP WITH TIME ZONE,
  reverted_at TIMESTAMP WITH TIME ZONE,
  revert_reason TEXT
);

-- AI summaries table
CREATE TABLE public.monitoring_ai_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  summary_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'GO', 'CAUTION', 'NO-GO'
  status_emoji TEXT NOT NULL,
  score INTEGER,
  ai_summary TEXT NOT NULL, -- The generated summary
  what_changed TEXT[] DEFAULT '{}',
  incidents JSONB DEFAULT '[]'::jsonb,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  current_risks JSONB DEFAULT '[]'::jsonb,
  confidence_level TEXT, -- 'high', 'medium', 'low'
  recommendation TEXT NOT NULL, -- 'Scale ads', 'Maintain', 'Investigate', 'Pause'
  model_used TEXT,
  UNIQUE(summary_date)
);

-- Enable RLS
ALTER TABLE public.monitoring_predictive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_budget_tapers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_ai_summaries ENABLE ROW LEVEL SECURITY;

-- Allow admin access
CREATE POLICY "Admins can manage predictive alerts"
  ON public.monitoring_predictive_alerts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage budget tapers"
  ON public.monitoring_budget_tapers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage AI summaries"
  ON public.monitoring_ai_summaries FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes for performance
CREATE INDEX idx_predictive_alerts_active ON public.monitoring_predictive_alerts(is_active) WHERE is_active = true;
CREATE INDEX idx_predictive_alerts_created ON public.monitoring_predictive_alerts(created_at DESC);
CREATE INDEX idx_budget_tapers_platform ON public.monitoring_budget_tapers(platform, created_at DESC);
CREATE INDEX idx_ai_summaries_date ON public.monitoring_ai_summaries(summary_date DESC);