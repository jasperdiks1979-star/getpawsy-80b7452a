
-- PCIE2 sole publisher consolidation: trace + queue tables, reject reasons
CREATE TYPE public.pcie2_module_status AS ENUM ('pass','fail','skip','warn');
CREATE TYPE public.pcie2_reject_reason AS ENUM (
  'irrelevant_headline','cj_supplier_image','duplicate_creative',
  'low_quality','wrong_category','integrity_failed','classifier_low_confidence',
  'missing_hook','missing_headline','banned_phrase','other'
);

CREATE TABLE public.pcie2_pipeline_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL,
  pin_queue_id UUID NULL,
  pinterest_pin_id TEXT NULL,
  product_id UUID NULL,
  product_slug TEXT NULL,
  module TEXT NOT NULL,
  module_version TEXT NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0,
  status public.pcie2_module_status NOT NULL,
  reject_reason public.pcie2_reject_reason NULL,
  reason TEXT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_hash TEXT NULL,
  output_hash TEXT NULL,
  duration_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcie2_trace_trace_id ON public.pcie2_pipeline_trace(trace_id);
CREATE INDEX idx_pcie2_trace_pin ON public.pcie2_pipeline_trace(pin_queue_id);
CREATE INDEX idx_pcie2_trace_product ON public.pcie2_pipeline_trace(product_id);
CREATE INDEX idx_pcie2_trace_created ON public.pcie2_pipeline_trace(created_at DESC);

GRANT SELECT ON public.pcie2_pipeline_trace TO authenticated;
GRANT ALL ON public.pcie2_pipeline_trace TO service_role;
ALTER TABLE public.pcie2_pipeline_trace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_trace_admin_read" ON public.pcie2_pipeline_trace
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pcie2_publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  product_class TEXT NULL,
  headline TEXT NULL,
  hook TEXT NULL,
  image_url TEXT NULL,
  board_id TEXT NULL,
  destination_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|gating|approved|rejected|published|failed
  reject_reason public.pcie2_reject_reason NULL,
  reject_detail TEXT NULL,
  quality_score NUMERIC NULL,
  similarity_score NUMERIC NULL,
  classifier_confidence NUMERIC NULL,
  meta JSONB NOT NULL DEFAULT '{"pipeline":"pcie2"}'::jsonb,
  pinterest_pin_id TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcie2_pq_status ON public.pcie2_publish_queue(status);
CREATE INDEX idx_pcie2_pq_product ON public.pcie2_publish_queue(product_id);

GRANT SELECT ON public.pcie2_publish_queue TO authenticated;
GRANT ALL ON public.pcie2_publish_queue TO service_role;
ALTER TABLE public.pcie2_publish_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_pq_admin_read" ON public.pcie2_publish_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.pcie2_pq_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_pcie2_pq_touch BEFORE UPDATE ON public.pcie2_publish_queue
  FOR EACH ROW EXECUTE FUNCTION public.pcie2_pq_touch();

-- Legacy publisher inventory snapshot
CREATE TABLE public.pcie2_legacy_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL, -- edge_function | cron | trigger | feature_flag | queue
  name TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  neutralized BOOLEAN NOT NULL DEFAULT false,
  neutralized_via TEXT NULL
);
GRANT SELECT ON public.pcie2_legacy_inventory TO authenticated;
GRANT ALL ON public.pcie2_legacy_inventory TO service_role;
ALTER TABLE public.pcie2_legacy_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_legacy_admin_read" ON public.pcie2_legacy_inventory
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
