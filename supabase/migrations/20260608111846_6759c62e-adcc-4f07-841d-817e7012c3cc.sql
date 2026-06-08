
-- 1. Storefront view: only in-stock, active, non-duplicate products.
CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = true) AS
SELECT id, name, slug, description, price, compare_at_price, category, image_url, images,
       stock, sku, cj_product_id, variants, weight, shipping_time, is_active, created_at,
       updated_at, supplier_name, last_stock_sync_at, is_duplicate, canonical_product_id,
       dedupe_key, stock_sync_status, stock_source, supplier_warehouse, seo_tier,
       primary_species, primary_intent
FROM public.products
WHERE is_active = true
  AND COALESCE(is_duplicate, false) = false
  AND (stock IS NULL OR stock > 0)
  AND (availability IS NULL OR availability = 'in stock');

GRANT SELECT ON public.products_public TO anon, authenticated;
GRANT ALL    ON public.products_public TO service_role;

-- 2. Detail view: active, non-duplicate products including out-of-stock (PDP reachability for SEO).
CREATE OR REPLACE VIEW public.products_detail
WITH (security_invoker = true) AS
SELECT id, name, slug, description, price, compare_at_price, category, image_url, images,
       stock, sku, cj_product_id, variants, weight, shipping_time, is_active, created_at,
       updated_at, supplier_name, last_stock_sync_at, is_duplicate, canonical_product_id,
       dedupe_key, stock_sync_status, stock_source, supplier_warehouse, seo_tier,
       primary_species, primary_intent, availability
FROM public.products
WHERE is_active = true
  AND COALESCE(is_duplicate, false) = false;

GRANT SELECT ON public.products_detail TO anon, authenticated;
GRANT ALL    ON public.products_detail TO service_role;

-- 3. Admin stock audit summary.
CREATE OR REPLACE VIEW public.product_stock_audit
WITH (security_invoker = true) AS
SELECT
  COUNT(*)                                                                                AS total_products,
  COUNT(*) FILTER (WHERE is_active = true)                                                AS active_products,
  COUNT(*) FILTER (WHERE is_active = true
                   AND (stock IS NULL OR stock > 0)
                   AND (availability IS NULL OR availability = 'in stock'))               AS in_stock_products,
  COUNT(*) FILTER (WHERE is_active = true
                   AND (stock = 0 OR availability = 'out of stock'))                      AS out_of_stock_products,
  -- "Visible OOS" = active OOS not flagged as duplicate (would surface in legacy views).
  COUNT(*) FILTER (WHERE is_active = true
                   AND COALESCE(is_duplicate, false) = false
                   AND (stock = 0 OR availability = 'out of stock'))                      AS visible_out_of_stock_products,
  -- "Feed OOS" = same as visible OOS (those are the rows the feed exporter would include if not filtered).
  COUNT(*) FILTER (WHERE is_active = true
                   AND COALESCE(is_duplicate, false) = false
                   AND (stock = 0 OR availability = 'out of stock'))                      AS feed_out_of_stock_products,
  COUNT(*) FILTER (WHERE is_active = true
                   AND COALESCE(is_duplicate, false) = false
                   AND (stock = 0 OR availability = 'out of stock'))                      AS atc_enabled_out_of_stock_products,
  NOW()                                                                                   AS computed_at
FROM public.products;

GRANT SELECT ON public.product_stock_audit TO authenticated;
GRANT ALL    ON public.product_stock_audit TO service_role;
