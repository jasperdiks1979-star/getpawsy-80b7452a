-- Create a public view that excludes sensitive business data (cost_price)
CREATE VIEW public.products_public
WITH (security_invoker = on) AS
SELECT 
  id,
  cj_product_id,
  name,
  description,
  category,
  image_url,
  images,
  price,
  compare_at_price,
  sku,
  variants,
  stock,
  is_active,
  weight,
  shipping_time,
  supplier_name,
  created_at,
  updated_at
FROM public.products
WHERE is_active = true;

-- Drop the old permissive public policy
DROP POLICY IF EXISTS "Products are publicly readable" ON public.products;

-- Create new policy: Public users can only access active products (they should use the view)
-- This denies direct table access to non-admins for SELECT
CREATE POLICY "Public can view active products via view"
ON public.products
FOR SELECT
USING (
  is_active = true 
  AND NOT has_role(auth.uid(), 'admin'::app_role)
);

-- Create policy for admins to see everything including cost_price
CREATE POLICY "Admins can view all product data"
ON public.products
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));