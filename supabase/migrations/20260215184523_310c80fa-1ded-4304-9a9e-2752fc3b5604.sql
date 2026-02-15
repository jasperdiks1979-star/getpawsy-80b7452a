
-- Validation events log for CWV validation lifecycle
CREATE TABLE public.cwv_validation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL, -- 'marked_ready', 'user_started_validation', 'monitoring', 'user_confirmed_validated', 'regression_detected'
  notes TEXT,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.cwv_validation_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
CREATE POLICY "Admins can manage validation events"
  ON public.cwv_validation_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_cwv_validation_ts ON public.cwv_validation_events (ts DESC);
