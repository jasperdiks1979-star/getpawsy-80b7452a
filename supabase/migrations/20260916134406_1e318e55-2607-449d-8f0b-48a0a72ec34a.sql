CREATE OR REPLACE VIEW public.products_shop AS
 SELECT id, name, name_clean, slug, description, price, compare_at_price, category,
        image_url, images, stock, sku, cj_product_id, variants, weight, shipping_time,
        is_active, created_at, updated_at, supplier_name, last_stock_sync_at,
        is_duplicate, canonical_product_id, dedupe_key, stock_sync_status, stock_source,
        supplier_warehouse, seo_tier, primary_species, primary_intent,
        merch_role, merch_hidden, seo_noindex, merch_rank
   FROM public.products
  WHERE merch_hidden = false AND is_active = true;
ALTER VIEW public.products_shop SET (security_invoker = true);
GRANT SELECT ON public.products_shop TO anon, authenticated;
GRANT ALL ON public.products_shop TO service_role;