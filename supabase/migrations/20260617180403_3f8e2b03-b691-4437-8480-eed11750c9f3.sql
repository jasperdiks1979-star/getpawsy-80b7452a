
DROP POLICY IF EXISTS "Service role can upload blog images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update blog images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete blog images" ON storage.objects;

CREATE POLICY "Service role can upload blog images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'blog-images'
  AND (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Service role can update blog images"
ON storage.objects FOR UPDATE
TO public
USING (
  bucket_id = 'blog-images'
  AND (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
)
WITH CHECK (
  bucket_id = 'blog-images'
  AND (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Service role can delete blog images"
ON storage.objects FOR DELETE
TO public
USING (
  bucket_id = 'blog-images'
  AND (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
);
