-- Add a public-read RLS policy on products limited to the same filter as products_public
DROP POLICY IF EXISTS "Public can view listable products" ON public.products;
CREATE POLICY "Public can view listable products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND COALESCE(is_duplicate, false) = false
  AND (stock IS NULL OR stock > 0)
  AND slug IS NOT NULL
  AND price > 0
  AND image_url IS NOT NULL
);

GRANT SELECT ON public.products TO anon, authenticated;

-- Flip the view to security_invoker so it respects RLS of the caller
ALTER VIEW public.products_public SET (security_invoker = on);

GRANT SELECT ON public.products_public TO anon, authenticated;