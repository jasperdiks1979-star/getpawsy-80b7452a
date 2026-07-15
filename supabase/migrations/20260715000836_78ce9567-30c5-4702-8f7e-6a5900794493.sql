DROP VIEW IF EXISTS public.products_detail CASCADE;
CREATE VIEW public.products_detail AS
SELECT id, name, name_clean, slug, description, price, compare_at_price, category,
       image_url, images, stock, sku, cj_product_id, variants, weight, shipping_time,
       is_active, created_at, updated_at, supplier_name, last_stock_sync_at,
       is_duplicate, canonical_product_id, dedupe_key, stock_sync_status, stock_source,
       supplier_warehouse, seo_tier, primary_species, primary_intent, availability
FROM public.products
WHERE is_active = true AND COALESCE(is_duplicate, false) = false;
GRANT SELECT ON public.products_detail TO anon, authenticated, service_role;