-- Add proxy LCP fields and connection hints to web_vitals for richer diagnostics
-- This lets us track iOS Safari proxy LCP separately from real LCP and analyze by network type

ALTER TABLE public.web_vitals
  ADD COLUMN IF NOT EXISTS proxy_lcp_value numeric NULL,
  ADD COLUMN IF NOT EXISTS proxy_lcp_candidate text NULL,
  ADD COLUMN IF NOT EXISTS connection_type text NULL;

-- Add index for route-group aggregation queries (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_web_vitals_path_ts ON public.web_vitals (path, ts DESC);
CREATE INDEX IF NOT EXISTS idx_web_vitals_device_ts ON public.web_vitals (device_hint, ts DESC);