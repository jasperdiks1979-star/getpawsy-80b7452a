
-- Image compliance scores table
CREATE TABLE public.product_image_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  image_position INTEGER NOT NULL DEFAULT 0, -- 0 = primary, 1-9 = additional
  quality_score TEXT NOT NULL DEFAULT 'pending', -- high, medium, low, pending
  violations JSONB DEFAULT '[]'::jsonb, -- [{type: "text_overlay", detail: "SALE badge detected"}]
  is_compliant BOOLEAN DEFAULT NULL,
  scan_model TEXT, -- which AI model was used
  scan_result JSONB DEFAULT '{}'::jsonb, -- full AI response
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, image_url)
);

-- Enable RLS
ALTER TABLE public.product_image_compliance ENABLE ROW LEVEL SECURITY;

-- Admin-only access via has_role
CREATE POLICY "Admins can manage image compliance"
  ON public.product_image_compliance
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for fast lookups
CREATE INDEX idx_image_compliance_product ON public.product_image_compliance(product_id);
CREATE INDEX idx_image_compliance_score ON public.product_image_compliance(quality_score);

-- Updated_at trigger
CREATE TRIGGER update_image_compliance_updated_at
  BEFORE UPDATE ON public.product_image_compliance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
