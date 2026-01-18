-- Create storage bucket for blog images
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public read access
CREATE POLICY "Blog images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-images');

-- Create policy for authenticated users to upload (admin will handle through edge function)
CREATE POLICY "Service role can upload blog images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'blog-images');

-- Create policy for service role to update
CREATE POLICY "Service role can update blog images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'blog-images');

-- Create policy for service role to delete
CREATE POLICY "Service role can delete blog images"
ON storage.objects FOR DELETE
USING (bucket_id = 'blog-images');