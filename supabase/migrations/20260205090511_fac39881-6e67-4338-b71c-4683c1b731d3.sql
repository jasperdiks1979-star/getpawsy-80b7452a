-- Add new columns for ads health map tracking
ALTER TABLE public.monitoring_ad_landing_pages
ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'blocked')),
ADD COLUMN IF NOT EXISTS funnel_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS alternative_url TEXT,
ADD COLUMN IF NOT EXISTS at_risk BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS risk_reason TEXT;

-- Create table for release guard runs
CREATE TABLE IF NOT EXISTS public.monitoring_release_guards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Check results
  category_check_passed BOOLEAN,
  add_to_cart_check_passed BOOLEAN,
  bestseller_check_passed BOOLEAN,
  mobile_render_check_passed BOOLEAN,
  
  -- Overall result
  all_checks_passed BOOLEAN NOT NULL DEFAULT false,
  blocked BOOLEAN NOT NULL DEFAULT false,
  override_approved_by TEXT,
  override_approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Failure details
  failure_report JSONB DEFAULT '{}'::jsonb,
  affected_components TEXT[],
  revenue_impact_summary TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for self-healing logs
CREATE TABLE IF NOT EXISTS public.monitoring_self_healing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_name TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  
  -- Details
  original_state JSONB,
  fallback_state JSONB,
  affected_url TEXT,
  
  -- Resolution
  permanent_fix_suggestion TEXT,
  reverted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitoring_release_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_self_healing_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for release guards
CREATE POLICY "Admins can view release guards" ON public.monitoring_release_guards
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage release guards" ON public.monitoring_release_guards
  FOR ALL USING (auth.role() = 'service_role'::text);

-- RLS policies for self-healing logs
CREATE POLICY "Admins can view self-healing logs" ON public.monitoring_self_healing_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage self-healing logs" ON public.monitoring_self_healing_logs
  FOR ALL USING (auth.role() = 'service_role'::text);