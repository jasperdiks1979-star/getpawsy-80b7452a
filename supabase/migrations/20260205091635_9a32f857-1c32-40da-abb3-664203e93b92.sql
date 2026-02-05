-- Create audit log table (immutable, append-only)
CREATE TABLE public.monitoring_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  severity TEXT NOT NULL CHECK (severity IN ('P1', 'P2', 'INFO', 'ACTION')),
  action_type TEXT NOT NULL,
  trigger_condition TEXT NOT NULL,
  affected_urls TEXT[] DEFAULT '{}',
  affected_components TEXT[] DEFAULT '{}',
  action_taken TEXT NOT NULL,
  action_result TEXT,
  is_recommendation BOOLEAN DEFAULT false,
  related_incident_id UUID,
  related_run_id UUID,
  metadata JSONB DEFAULT '{}'
);

-- Create ad-pause actions table
CREATE TABLE public.monitoring_ad_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN ('pause', 'resume', 'recommendation')),
  platform TEXT NOT NULL,
  campaign_ids TEXT[] DEFAULT '{}',
  affected_urls TEXT[] DEFAULT '{}',
  trigger_reason TEXT NOT NULL,
  trigger_status TEXT NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reverted_at TIMESTAMP WITH TIME ZONE,
  is_recommendation BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitoring_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_ad_actions ENABLE ROW LEVEL SECURITY;

-- Audit logs policies (read-only for admins, insert for service role)
CREATE POLICY "Admins can view audit logs"
  ON public.monitoring_audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert audit logs"
  ON public.monitoring_audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role'::text);

-- Ad actions policies
CREATE POLICY "Admins can view ad actions"
  ON public.monitoring_ad_actions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage ad actions"
  ON public.monitoring_ad_actions FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_timestamp ON public.monitoring_audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_action_type ON public.monitoring_audit_logs(action_type);
CREATE INDEX idx_audit_logs_severity ON public.monitoring_audit_logs(severity);
CREATE INDEX idx_ad_actions_created ON public.monitoring_ad_actions(created_at DESC);
CREATE INDEX idx_ad_actions_platform ON public.monitoring_ad_actions(platform);