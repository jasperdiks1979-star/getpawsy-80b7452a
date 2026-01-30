-- Create storage bucket for Pinterest ad images
INSERT INTO storage.buckets (id, name, public)
VALUES ('pinterest-ads', 'pinterest-ads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to pinterest ads
CREATE POLICY "Pinterest ads are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'pinterest-ads');

-- Allow authenticated users to upload pinterest ads
CREATE POLICY "Authenticated users can upload pinterest ads"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pinterest-ads' AND auth.role() = 'authenticated');