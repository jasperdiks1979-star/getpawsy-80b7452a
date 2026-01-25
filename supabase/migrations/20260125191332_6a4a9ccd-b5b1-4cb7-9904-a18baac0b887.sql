-- Drop conflicting policy first
DROP POLICY IF EXISTS "Users can delete their own dispute attachments" ON storage.objects;

-- Recreate with unique name for dispute-attachments bucket
CREATE POLICY "Delete own dispute attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dispute-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);