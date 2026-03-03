
CREATE TABLE public.shopping_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  original_title TEXT,
  optimized_title TEXT,
  original_description TEXT,
  optimized_description TEXT,
  google_product_category TEXT,
  google_product_category_id INTEGER,
  product_type TEXT,
  keyword_suggestions TEXT[],
  optimization_score INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

ALTER TABLE public.shopping_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on shopping_optimizations"
ON public.shopping_optimizations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_shopping_optimizations_updated_at
  BEFORE UPDATE ON public.shopping_optimizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
