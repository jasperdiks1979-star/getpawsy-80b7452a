-- Create table for AI priority rankings
CREATE TABLE public.monitoring_priority_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  priority_rank INTEGER NOT NULL CHECK (priority_rank BETWEEN 1 AND 5),
  issue_summary TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  estimated_impact TEXT NOT NULL,
  recommended_action TEXT NOT NULL CHECK (recommended_action IN ('do_now', 'schedule', 'monitor')),
  revenue_impact_score INTEGER DEFAULT 0,
  ad_spend_at_risk NUMERIC DEFAULT 0,
  conversion_drop_percent NUMERIC DEFAULT 0,
  fix_complexity TEXT DEFAULT 'medium' CHECK (fix_complexity IN ('quick_win', 'medium', 'heavy_work')),
  affected_urls TEXT[] DEFAULT '{}',
  related_incident_id UUID REFERENCES monitoring_incidents(id),
  is_active BOOLEAN DEFAULT true,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for scaling thresholds and playbook
CREATE TABLE public.monitoring_scaling_thresholds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  traffic_tier TEXT NOT NULL CHECK (traffic_tier IN ('baseline', '2x', '5x', '10x')),
  tier_multiplier NUMERIC NOT NULL DEFAULT 1,
  required_checks JSONB DEFAULT '[]',
  metrics_to_watch JSONB DEFAULT '[]',
  auto_protections JSONB DEFAULT '[]',
  failure_modes JSONB DEFAULT '[]',
  scale_conditions JSONB DEFAULT '{}',
  pause_conditions JSONB DEFAULT '{}',
  warning_signs JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(traffic_tier)
);

-- Create table for founder dashboard snapshots
CREATE TABLE public.monitoring_founder_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ads_health_status TEXT NOT NULL CHECK (ads_health_status IN ('go', 'caution', 'no_go')),
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  status_explanation TEXT,
  
  -- KPIs
  revenue_today NUMERIC DEFAULT 0,
  revenue_7day_avg NUMERIC DEFAULT 0,
  add_to_cart_rate_today NUMERIC DEFAULT 0,
  add_to_cart_rate_7day_avg NUMERIC DEFAULT 0,
  checkout_start_rate_today NUMERIC DEFAULT 0,
  checkout_start_rate_7day_avg NUMERIC DEFAULT 0,
  conversion_rate_today NUMERIC DEFAULT 0,
  conversion_rate_7day_avg NUMERIC DEFAULT 0,
  aov_today NUMERIC DEFAULT 0,
  aov_7day_avg NUMERIC DEFAULT 0,
  
  -- Funnel health
  pdp_health TEXT DEFAULT 'healthy' CHECK (pdp_health IN ('healthy', 'at_risk', 'critical')),
  cart_health TEXT DEFAULT 'healthy' CHECK (cart_health IN ('healthy', 'at_risk', 'critical')),
  checkout_health TEXT DEFAULT 'healthy' CHECK (checkout_health IN ('healthy', 'at_risk', 'critical')),
  
  -- Landing pages summary
  top_landing_pages JSONB DEFAULT '[]',
  
  -- Recent incidents
  recent_incidents JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date)
);

-- Enable RLS
ALTER TABLE public.monitoring_priority_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_scaling_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_founder_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies for priority rankings
CREATE POLICY "Admins can view priority rankings"
  ON public.monitoring_priority_rankings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage priority rankings"
  ON public.monitoring_priority_rankings FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for scaling thresholds
CREATE POLICY "Admins can view scaling thresholds"
  ON public.monitoring_scaling_thresholds FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage scaling thresholds"
  ON public.monitoring_scaling_thresholds FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for founder snapshots
CREATE POLICY "Admins can view founder snapshots"
  ON public.monitoring_founder_snapshots FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage founder snapshots"
  ON public.monitoring_founder_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- Insert default scaling thresholds
INSERT INTO public.monitoring_scaling_thresholds (traffic_tier, tier_multiplier, required_checks, metrics_to_watch, auto_protections, failure_modes, scale_conditions, pause_conditions, warning_signs) VALUES
('baseline', 1, 
  '["All P1 checks passing", "Checkout reachable", "No empty categories", "Mobile LCP < 3s"]',
  '["Conversion rate", "Add-to-cart rate", "Error rate", "Page load time"]',
  '["Self-healing UI", "Fallback products", "Error alerting"]',
  '["Intermittent 500 errors", "Slow image loading", "Cart sync issues"]',
  '{"min_score": 85, "min_conversion": 2.0}',
  '{"max_error_rate": 5, "min_score": 70}',
  '["Rising 404 rate", "LCP creeping up", "Cart abandonment spike"]'
),
('2x', 2,
  '["All baseline checks", "CDN caching verified", "Database queries optimized", "No memory leaks"]',
  '["Server response time", "Database query time", "CDN hit rate", "Memory usage"]',
  '["Rate limiting", "Query caching", "Image optimization", "Lazy loading"]',
  '["Database connection exhaustion", "CDN cache misses", "Memory pressure", "Slow third-party scripts"]',
  '{"min_score": 90, "min_conversion": 2.5, "max_response_time_ms": 500}',
  '{"max_error_rate": 3, "min_score": 75, "max_response_time_ms": 1000}',
  '["Response time > 300ms", "Cache hit rate < 80%", "Memory usage > 70%"]'
),
('5x', 5,
  '["All 2x checks", "Load tested to 5x", "Failover tested", "Monitoring coverage 100%"]',
  '["P99 latency", "Error budget", "Apdex score", "Real user metrics"]',
  '["Auto-scaling", "Circuit breakers", "Graceful degradation", "Queue-based processing"]',
  '["Thundering herd", "Cache stampede", "Payment gateway timeouts", "Inventory sync delays"]',
  '{"min_score": 92, "min_conversion": 2.8, "max_p99_ms": 800}',
  '{"max_error_rate": 2, "min_score": 80, "max_p99_ms": 1500}',
  '["P99 > 500ms", "Error rate > 1%", "Payment failures > 0.5%"]'
),
('10x', 10,
  '["All 5x checks", "Load tested to 10x", "Multi-region ready", "Incident playbooks documented"]',
  '["Global availability", "Regional latency", "Payment success rate", "Order processing time"]',
  '["Geographic load balancing", "Multi-region failover", "Priority queuing", "Traffic shaping"]',
  '["Regional outages", "Payment provider limits", "Inventory oversell", "Email/SMS delivery delays"]',
  '{"min_score": 95, "min_conversion": 3.0, "max_global_p99_ms": 600}',
  '{"max_error_rate": 1, "min_score": 85, "any_region_down": true}',
  '["Any region P99 > 400ms", "Cross-region sync lag", "Order queue depth > 100"]'
)
ON CONFLICT (traffic_tier) DO NOTHING;