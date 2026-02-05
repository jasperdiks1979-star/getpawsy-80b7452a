-- Table for per-landing-page predictive health scores
CREATE TABLE public.monitoring_landing_page_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_path TEXT NOT NULL,
  page_type TEXT NOT NULL, -- 'homepage', 'category', 'bestseller', 'product'
  campaign_id TEXT, -- optional mapping to ad campaign
  
  -- Score components (0-100 each)
  category_integrity_score INTEGER DEFAULT 100,
  product_availability_score INTEGER DEFAULT 100,
  bestseller_health_score INTEGER DEFAULT 100,
  add_to_cart_stability_score INTEGER DEFAULT 100,
  checkout_reachability_score INTEGER DEFAULT 100,
  conversion_trend_score INTEGER DEFAULT 100,
  mobile_performance_score INTEGER DEFAULT 100,
  
  -- Overall calculated score
  overall_score INTEGER NOT NULL DEFAULT 100,
  health_status TEXT NOT NULL DEFAULT 'healthy', -- 'healthy', 'at_risk', 'critical'
  
  -- Score breakdown for transparency
  score_breakdown JSONB DEFAULT '{}'::jsonb,
  
  -- Tracking
  previous_score INTEGER,
  score_delta INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_landing_page_score UNIQUE (url_path)
);

-- Score history for trend analysis
CREATE TABLE public.monitoring_score_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_path TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  health_status TEXT NOT NULL,
  score_breakdown JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Product QA results table
CREATE TABLE public.product_qa_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  
  -- QA trigger context
  trigger_type TEXT NOT NULL, -- 'created', 'activated', 'bestseller_added', 'ad_landing_added'
  
  -- Individual check results
  page_loads_check BOOLEAN DEFAULT NULL,
  image_gallery_check BOOLEAN DEFAULT NULL,
  add_to_cart_check BOOLEAN DEFAULT NULL,
  stock_status_check BOOLEAN DEFAULT NULL,
  shipping_copy_check BOOLEAN DEFAULT NULL,
  price_check BOOLEAN DEFAULT NULL,
  url_check BOOLEAN DEFAULT NULL,
  schema_check BOOLEAN DEFAULT NULL,
  
  -- Failure details
  failed_checks JSONB DEFAULT '[]'::jsonb,
  failure_screenshots JSONB DEFAULT '[]'::jsonb,
  
  -- Overall result
  all_checks_passed BOOLEAN NOT NULL DEFAULT false,
  qa_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'passed', 'failed', 'blocked'
  
  -- Blocking
  blocked_from_bestsellers BOOLEAN DEFAULT false,
  blocked_from_ads BOOLEAN DEFAULT false,
  block_reason TEXT,
  
  -- Admin override
  override_approved_by UUID,
  override_approved_at TIMESTAMP WITH TIME ZONE,
  override_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Realtime alerts queue table
CREATE TABLE public.monitoring_realtime_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL, -- 'score_drop', 'critical', 'checkout_fail', 'qa_fail', 'budget_action'
  severity TEXT NOT NULL DEFAULT 'P2', -- 'predictive', 'P1', 'P2'
  
  -- Alert content
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  affected_urls TEXT[] DEFAULT '{}',
  affected_campaigns TEXT[] DEFAULT '{}',
  
  -- Score context (if applicable)
  current_score INTEGER,
  previous_score INTEGER,
  score_delta INTEGER,
  
  -- Rich payload
  payload JSONB DEFAULT '{}'::jsonb,
  screenshot_urls TEXT[] DEFAULT '{}',
  recommended_action TEXT,
  
  -- Delivery status
  delivered_lovable BOOLEAN DEFAULT false,
  delivered_slack BOOLEAN DEFAULT false,
  delivered_whatsapp BOOLEAN DEFAULT false,
  delivered_email BOOLEAN DEFAULT false,
  
  -- Grouping & dedup
  alert_group_key TEXT,
  is_grouped BOOLEAN DEFAULT false,
  grouped_count INTEGER DEFAULT 1,
  
  -- Suppression
  is_suppressed BOOLEAN DEFAULT false,
  suppression_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '24 hours')
);

-- Enable RLS
ALTER TABLE public.monitoring_landing_page_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_qa_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_realtime_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for landing page scores
CREATE POLICY "Admins can view landing page scores"
  ON public.monitoring_landing_page_scores FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage landing page scores"
  ON public.monitoring_landing_page_scores FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for score history
CREATE POLICY "Admins can view score history"
  ON public.monitoring_score_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage score history"
  ON public.monitoring_score_history FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for product QA results
CREATE POLICY "Admins can view product QA results"
  ON public.product_qa_results FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update product QA results"
  ON public.product_qa_results FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage product QA results"
  ON public.product_qa_results FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for realtime alerts
CREATE POLICY "Admins can view realtime alerts"
  ON public.monitoring_realtime_alerts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage realtime alerts"
  ON public.monitoring_realtime_alerts FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_landing_page_scores_status ON public.monitoring_landing_page_scores(health_status);
CREATE INDEX idx_score_history_url ON public.monitoring_score_history(url_path, recorded_at DESC);
CREATE INDEX idx_product_qa_status ON public.product_qa_results(qa_status);
CREATE INDEX idx_product_qa_product ON public.product_qa_results(product_id);
CREATE INDEX idx_realtime_alerts_type ON public.monitoring_realtime_alerts(alert_type, created_at DESC);
CREATE INDEX idx_realtime_alerts_group ON public.monitoring_realtime_alerts(alert_group_key);