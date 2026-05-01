CREATE TABLE IF NOT EXISTS public.tracking_anomalies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  anomaly_type TEXT NOT NULL,
  source_channel TEXT,
  severity TEXT NOT NULL DEFAULT 'warn',
  sample_event_ids UUID[] NOT NULL DEFAULT '{}',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracking_anomalies_unique UNIQUE (session_id, anomaly_type)
);

CREATE INDEX IF NOT EXISTS idx_tracking_anomalies_created_at ON public.tracking_anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_anomalies_type ON public.tracking_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_tracking_anomalies_channel ON public.tracking_anomalies(source_channel);

ALTER TABLE public.tracking_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read tracking anomalies" ON public.tracking_anomalies;
CREATE POLICY "Admins can read tracking anomalies"
ON public.tracking_anomalies
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No insert/update/delete policies for client roles — service role bypasses RLS

DROP TRIGGER IF EXISTS update_tracking_anomalies_updated_at ON public.tracking_anomalies;
CREATE TRIGGER update_tracking_anomalies_updated_at
BEFORE UPDATE ON public.tracking_anomalies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();