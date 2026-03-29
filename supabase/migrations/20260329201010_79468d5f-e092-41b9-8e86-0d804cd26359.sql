
-- Fix: Recreate products_public with security_invoker=false
-- so anon users can read through this view despite RLS on products table.
-- Keeps same columns, excludes cost_price for security.

DROP VIEW IF EXISTS public.products_public;

CREATE VIEW public.products_public
WITH (security_invoker=false) AS
SELECT 
  id, name, slug, description, price, compare_at_price,
  category, image_url, images, stock, sku, cj_product_id,
  variants, weight, shipping_time, is_active,
  created_at, updated_at, supplier_name, last_stock_sync_at,
  is_duplicate, canonical_product_id, dedupe_key,
  stock_sync_status, stock_source, supplier_warehouse,
  seo_tier, primary_species, primary_intent
FROM public.products;

-- Grant access to anon and authenticated roles
GRANT SELECT ON public.products_public TO anon, authenticated;
