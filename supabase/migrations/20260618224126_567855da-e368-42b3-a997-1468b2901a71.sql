
CREATE TABLE IF NOT EXISTS public.content_product_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  pin_id text,
  queue_id uuid REFERENCES public.pinterest_video_queue(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.pinterest_video_assets(id) ON DELETE SET NULL,
  video_product_slug text,
  linked_product_slug text,
  destination_url text,
  detected_product text,
  confidence numeric,
  verdict text NOT NULL CHECK (verdict IN ('MATCH','POSSIBLE_MISMATCH','CONFIRMED_MISMATCH','ERROR')),
  reasoning text,
  frame_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  repair_status text,
  repair_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_product_audit_runs TO authenticated;
GRANT ALL ON public.content_product_audit_runs TO service_role;

ALTER TABLE public.content_product_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read content audit"
ON public.content_product_audit_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin write content audit"
ON public.content_product_audit_runs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_cpa_scan ON public.content_product_audit_runs(scan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpa_pin ON public.content_product_audit_runs(pin_id);
CREATE INDEX IF NOT EXISTS idx_cpa_verdict ON public.content_product_audit_runs(verdict);
