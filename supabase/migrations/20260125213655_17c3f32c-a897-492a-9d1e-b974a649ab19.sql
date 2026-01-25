-- Fix: Remove public read access from dispute-attachments storage bucket
-- Replace with authenticated access policies

-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Public can view dispute attachments" ON storage.objects;

-- Admins can view all dispute attachments
CREATE POLICY "Admins can view dispute attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dispute-attachments' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Authenticated customers can view attachments for their own disputes
-- Files are organized as: {dispute_id}/{filename}
CREATE POLICY "Customers view own dispute attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dispute-attachments'
  AND EXISTS (
    SELECT 1 FROM public.disputes d
    JOIN public.profiles p ON p.email = d.customer_email
    WHERE p.id = auth.uid()
    AND (storage.foldername(name))[1] = d.id::text
  )
);