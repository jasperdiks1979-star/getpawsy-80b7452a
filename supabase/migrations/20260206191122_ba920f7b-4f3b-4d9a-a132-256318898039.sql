
-- Step 1: Recreate products_public view WITHOUT security_invoker so it works for anonymous users
-- while the base table is restricted to admins only
DROP VIEW IF EXISTS public.products_public;

CREATE VIEW public.products_public AS
  SELECT id, name, slug, description, price, compare_at_price, category, image_url, images, stock, sku, cj_product_id, variants, weight, shipping_time, is_active, created_at, updated_at
  FROM public.products
  WHERE is_active = true;

-- Step 2: Remove the public SELECT policy that exposes cost_price
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
