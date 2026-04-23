-- Create a public storage bucket for admin-uploaded product images,
-- with a hard 20 MB per-file ceiling enforced at the storage layer.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  20971520, -- 20 MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access — product images are shown on the storefront.
CREATE POLICY "Product images are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

-- Only admins may upload / replace / delete product images.
CREATE POLICY "Admins can upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update product images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete product images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.has_role(auth.uid(), 'admin')
);