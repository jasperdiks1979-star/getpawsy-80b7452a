-- Create table for product matches between own products and competitor products
CREATE TABLE public.product_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  competitor_product_id UUID NOT NULL REFERENCES public.competitor_products(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL DEFAULT 0,
  match_type TEXT NOT NULL DEFAULT 'name',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, competitor_product_id)
);

-- Enable RLS
ALTER TABLE public.product_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view product matches"
  ON public.product_matches
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert product matches"
  ON public.product_matches
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update product matches"
  ON public.product_matches
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete product matches"
  ON public.product_matches
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage product matches"
  ON public.product_matches
  FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Create index for faster lookups
CREATE INDEX idx_product_matches_product_id ON public.product_matches(product_id);
CREATE INDEX idx_product_matches_competitor_product_id ON public.product_matches(competitor_product_id);

-- Trigger for updated_at
CREATE TRIGGER update_product_matches_updated_at
  BEFORE UPDATE ON public.product_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();