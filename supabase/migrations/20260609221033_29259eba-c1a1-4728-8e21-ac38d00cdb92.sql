-- Restore storefront: drop the availability text filter from products_public.
-- Stock>0 is the canonical signal; the availability column had drifted and
-- was hiding hundreds of valid in-stock products from the public catalog.
CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = on) AS
SELECT id, name, slug, description, price, compare_at_price, category,
       image_url, images, stock, sku, cj_product_id, variants, weight,
       shipping_time, is_active, created_at, updated_at, supplier_name,
       last_stock_sync_at, is_duplicate, canonical_product_id, dedupe_key,
       stock_sync_status, stock_source, supplier_warehouse, seo_tier,
       primary_species, primary_intent
  FROM public.products
 WHERE is_active = true
   AND COALESCE(is_duplicate, false) = false
   AND (stock IS NULL OR stock > 0)
   AND slug IS NOT NULL
   AND price > 0
   AND image_url IS NOT NULL;

GRANT SELECT ON public.products_public TO anon, authenticated;
GRANT ALL  ON public.products_public TO service_role;