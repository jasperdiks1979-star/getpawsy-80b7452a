
-- Deactivate all bestseller entries that point to inactive products
-- This prevents showing product cards that link to 404 pages
UPDATE public.bestsellers b
SET is_active = false
FROM public.products p
WHERE b.product_id = p.id
  AND b.is_active = true
  AND p.is_active = false;
