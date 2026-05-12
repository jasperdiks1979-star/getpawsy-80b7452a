
CREATE TABLE IF NOT EXISTS public.mi_channel_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('pinterest','tiktok')),
  queue_id UUID NOT NULL,
  external_id TEXT,
  product_id UUID,
  hook_family TEXT,
  impressions BIGINT NOT NULL DEFAULT 0,
  views BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  save_rate NUMERIC NOT NULL DEFAULT 0,
  view_rate NUMERIC NOT NULL DEFAULT 0,
  composite_score NUMERIC NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, queue_id)
);

CREATE INDEX IF NOT EXISTS idx_mi_channel_metrics_channel ON public.mi_channel_metrics(channel);
CREATE INDEX IF NOT EXISTS idx_mi_channel_metrics_product ON public.mi_channel_metrics(product_id);
CREATE INDEX IF NOT EXISTS idx_mi_channel_metrics_hook ON public.mi_channel_metrics(hook_family);

ALTER TABLE public.mi_channel_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mi_channel_metrics"
  ON public.mi_channel_metrics
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_mi_channel_metrics_updated_at
  BEFORE UPDATE ON public.mi_channel_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
