
-- Fix 1: product-media bucket policy — scope public read to known public folder (cj/) instead of entire bucket
DROP POLICY IF EXISTS "Public read product-media" ON storage.objects;

CREATE POLICY "Public read product-media cj folder"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'product-media'
  AND (storage.foldername(name))[1] = 'cj'
);

-- Fix 2: cj_us_winners — remove public read, restrict to admins + service_role
DROP POLICY IF EXISTS "Public read cj_us_winners" ON public.cj_us_winners;

CREATE POLICY "Admins read cj_us_winners"
ON public.cj_us_winners
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
