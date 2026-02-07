
-- Step 1: Add deduplication columns to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canonical_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Step 2: Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_products_is_duplicate ON public.products(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_products_canonical_product_id ON public.products(canonical_product_id);
CREATE INDEX IF NOT EXISTS idx_products_dedupe_key ON public.products(dedupe_key);

-- Step 3: Create dedupe_conflicts table for logging price conflicts
CREATE TABLE IF NOT EXISTS public.dedupe_conflicts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key text NOT NULL,
  canonical_product_id uuid REFERENCES public.products(id),
  duplicate_product_id uuid REFERENCES public.products(id),
  canonical_price numeric,
  duplicate_price numeric,
  price_diff_pct numeric,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dedupe_conflicts ENABLE ROW LEVEL SECURITY;

-- Only admins can see dedupe conflicts
CREATE POLICY "Admins can manage dedupe_conflicts"
  ON public.dedupe_conflicts
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Step 4: Update the products_public view to exclude duplicates
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public AS
  SELECT id, name, slug, description, price, compare_at_price, category,
         image_url, images, stock, sku, cj_product_id, variants, weight,
         shipping_time, is_active, created_at, updated_at
  FROM public.products
  WHERE is_active = true AND is_duplicate = false;
