
-- Web Vitals field data table
CREATE TABLE public.web_vitals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  path TEXT NOT NULL,
  device_hint TEXT, -- 'mobile' or 'desktop'
  lcp_value DOUBLE PRECISION,
  lcp_element TEXT,
  cls_value DOUBLE PRECISION,
  inp_value DOUBLE PRECISION,
  inp_event TEXT,
  fcp_value DOUBLE PRECISION,
  ttfb_value DOUBLE PRECISION,
  ua TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

-- Allow anon inserts (field data from any visitor)
CREATE POLICY "Anyone can insert web vitals"
  ON public.web_vitals FOR INSERT
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can read web vitals"
  ON public.web_vitals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for efficient querying
CREATE INDEX idx_web_vitals_ts ON public.web_vitals (ts DESC);
CREATE INDEX idx_web_vitals_path_device ON public.web_vitals (path, device_hint);

-- Auto-cleanup after 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_web_vitals()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.web_vitals WHERE ts < now() - interval '30 days';
END;
$$;
