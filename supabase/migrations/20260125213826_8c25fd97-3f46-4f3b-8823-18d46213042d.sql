-- Fix: Correct the storage path matching in RLS policy
-- Files are uploaded as: userId/disputeId/filename
-- So index [2] gets the disputeId, not [1]

-- Drop the incorrect policy
DROP POLICY IF EXISTS "Customers view own dispute attachments" ON storage.objects;

-- Recreate with correct array index
CREATE POLICY "Customers view own dispute attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dispute-attachments'
  AND EXISTS (
    SELECT 1 FROM public.disputes d
    JOIN public.profiles p ON p.email = d.customer_email
    WHERE p.id = auth.uid()
    AND (storage.foldername(name))[2] = d.id::text
  )
);