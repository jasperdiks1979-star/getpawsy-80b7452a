CREATE TABLE IF NOT EXISTS public.pinterest_health_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  condition TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  recovery_attempted BOOLEAN NOT NULL DEFAULT false,
  recovery_result JSONB,
  sms_alert_sent BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pinterest_health_incidents_created_idx
  ON public.pinterest_health_incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_health_incidents_open_idx
  ON public.pinterest_health_incidents (status, condition);

GRANT SELECT ON public.pinterest_health_incidents TO authenticated;
GRANT ALL ON public.pinterest_health_incidents TO service_role;

ALTER TABLE public.pinterest_health_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read pinterest health incidents"
  ON public.pinterest_health_incidents
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));