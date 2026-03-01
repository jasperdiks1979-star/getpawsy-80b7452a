-- Update products_public view to include species taxonomy columns
CREATE OR REPLACE VIEW public.products_public AS
SELECT 
  id,
  name,
  slug,
  description,
  price,
  compare_at_price,
  category,
  image_url,
  images,
  stock,
  sku,
  cj_product_id,
  variants,
  weight,
  shipping_time,
  is_active,
  created_at,
  updated_at,
  supplier_name,
  last_stock_sync_at,
  is_duplicate,
  canonical_product_id,
  dedupe_key,
  stock_sync_status,
  stock_source,
  supplier_warehouse,
  seo_tier,
  primary_species,
  primary_intent
FROM products
WHERE is_active = true AND is_duplicate = false;