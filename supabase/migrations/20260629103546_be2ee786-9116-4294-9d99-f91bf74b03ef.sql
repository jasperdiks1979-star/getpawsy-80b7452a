CREATE TABLE IF NOT EXISTS public.cie_ga4_api_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trace_id TEXT,
  days INT NOT NULL,
  data_api_reachable BOOLEAN NOT NULL,
  latency_ms INT,
  page_view_count INT NOT NULL DEFAULT 0,
  session_start_count INT NOT NULL DEFAULT 0,
  begin_checkout_count INT NOT NULL DEFAULT 0,
  purchase_count INT NOT NULL DEFAULT 0,
  purchase_available BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cie_ga4_api_health_checked_at ON public.cie_ga4_api_health (checked_at DESC);
GRANT SELECT ON public.cie_ga4_api_health TO authenticated;
GRANT ALL ON public.cie_ga4_api_health TO service_role;
ALTER TABLE public.cie_ga4_api_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view GA4 API health" ON public.cie_ga4_api_health
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));