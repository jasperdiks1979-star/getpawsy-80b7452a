-- Recreate the products_public view to include the slug column
DROP VIEW IF EXISTS products_public;

CREATE VIEW products_public 
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
  supplier_name,
  created_at,
  updated_at
FROM products;