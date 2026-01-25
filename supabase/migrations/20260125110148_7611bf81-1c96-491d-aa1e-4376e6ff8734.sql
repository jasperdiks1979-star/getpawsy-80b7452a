-- Create storage bucket for dispute message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-attachments', 'dispute-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own attachments
CREATE POLICY "Authenticated users can upload dispute attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'dispute-attachments' 
  AND auth.role() = 'authenticated'
);

-- Allow public read access to dispute attachments
CREATE POLICY "Public can view dispute attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'dispute-attachments');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete their own dispute attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'dispute-attachments' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);