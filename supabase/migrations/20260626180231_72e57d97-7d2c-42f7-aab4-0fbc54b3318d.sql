DROP POLICY IF EXISTS "Public read product-media cj folder" ON storage.objects;
CREATE POLICY "Public read product-media cj videos only"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'product-media'
  AND (storage.foldername(name))[1] = 'cj'
  AND (
    (metadata->>'mimetype') LIKE 'video/%'
    OR lower(name) LIKE '%.mp4'
    OR lower(name) LIKE '%.webm'
    OR lower(name) LIKE '%.mov'
    OR lower(name) LIKE '%.m4v'
  )
);