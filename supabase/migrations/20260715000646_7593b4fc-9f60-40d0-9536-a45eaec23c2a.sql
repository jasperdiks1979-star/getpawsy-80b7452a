DROP VIEW IF EXISTS public.products_public CASCADE;
CREATE VIEW public.products_public AS
SELECT
  id, name, name_clean, slug, description, price, compare_at_price, category,
  image_url, images, stock, sku, cj_product_id, variants, weight, shipping_time,
  is_active, created_at, updated_at, supplier_name, last_stock_sync_at,
  is_duplicate, canonical_product_id, dedupe_key, stock_sync_status, stock_source,
  supplier_warehouse, seo_tier, primary_species, primary_intent
FROM public.products;
GRANT SELECT ON public.products_public TO anon, authenticated, service_role;