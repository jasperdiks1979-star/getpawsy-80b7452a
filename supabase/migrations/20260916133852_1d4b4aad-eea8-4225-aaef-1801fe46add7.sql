ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS merch_role text NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS merch_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seo_noindex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merch_rank integer,
  ADD COLUMN IF NOT EXISTS merch_batch text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_merch_role_check;
ALTER TABLE public.products ADD CONSTRAINT products_merch_role_check
  CHECK (merch_role IN ('hero','core','accessory','longtail','legacy','retired','blocked','unassigned'));

CREATE INDEX IF NOT EXISTS idx_products_merch_role ON public.products (merch_role) WHERE merch_hidden = false;

CREATE TABLE IF NOT EXISTS public.commercial_rebuild_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  product_id uuid,
  slug text,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crl_batch ON public.commercial_rebuild_ledger (batch, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.commercial_rebuild_ledger TO authenticated;
GRANT ALL ON public.commercial_rebuild_ledger TO service_role;
ALTER TABLE public.commercial_rebuild_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rebuild ledger" ON public.commercial_rebuild_ledger
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.product_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug text NOT NULL UNIQUE,
  target_path text NOT NULL,
  reason text NOT NULL,
  confidence text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_redirects_active ON public.product_redirects (source_slug) WHERE is_active;
GRANT SELECT ON public.product_redirects TO anon;
GRANT SELECT ON public.product_redirects TO authenticated;
GRANT ALL ON public.product_redirects TO service_role;
ALTER TABLE public.product_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active product redirects" ON public.product_redirects
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage product redirects" ON public.product_redirects
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.products_public AS
 SELECT id, name, name_clean, slug, description, price, compare_at_price, category,
        image_url, images, stock, sku, cj_product_id, variants, weight, shipping_time,
        is_active, created_at, updated_at, supplier_name, last_stock_sync_at,
        is_duplicate, canonical_product_id, dedupe_key, stock_sync_status, stock_source,
        supplier_warehouse, seo_tier, primary_species, primary_intent,
        merch_role, merch_hidden, seo_noindex, merch_rank
   FROM public.products;