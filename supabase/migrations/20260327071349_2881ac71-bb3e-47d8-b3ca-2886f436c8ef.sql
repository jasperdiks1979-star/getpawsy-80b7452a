-- Allow anonymous/public users to read active, non-duplicate products
CREATE POLICY "Public can view active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = true AND is_duplicate = false);