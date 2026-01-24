-- Drop and recreate the products_public view without sensitive fields
DROP VIEW IF EXISTS public.products_public;

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
    slug,
    variants,
    stock,
    is_active,
    weight,
    shipping_time,
    created_at,
    updated_at
FROM products
WHERE is_active = true;

-- Add comment explaining the view's purpose
COMMENT ON VIEW public.products_public IS 'Public-facing product view that excludes sensitive fields like cost_price and supplier_name. Only shows active products.';