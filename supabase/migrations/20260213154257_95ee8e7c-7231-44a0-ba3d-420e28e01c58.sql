
-- Extend service_account_keys with anomaly detection and recovery fields
ALTER TABLE public.service_account_keys
  ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_check_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_anomaly_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anomaly_flags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS api_usage_baseline JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS billing_alert_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_alert_configured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS essential_contacts_configured BOOLEAN DEFAULT false;

-- Create security_anomaly_events table for detailed anomaly tracking
CREATE TABLE IF NOT EXISTS public.security_anomaly_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_account_key_id UUID REFERENCES public.service_account_keys(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  description TEXT NOT NULL,
  details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_anomaly_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage anomaly events"
ON public.security_anomaly_events FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create credential_health_checks table for health check history
CREATE TABLE IF NOT EXISTS public.credential_health_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_account_key_id UUID REFERENCES public.service_account_keys(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credential_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage health checks"
ON public.credential_health_checks FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_health_checks_created ON public.credential_health_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_created ON public.security_anomaly_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_account_keys_status ON public.service_account_keys(rotation_status, health_check_status);
