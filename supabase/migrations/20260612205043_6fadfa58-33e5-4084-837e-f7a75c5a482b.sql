
-- 1. Pinterest runtime settings: remove broad authenticated read
DROP POLICY IF EXISTS "Authenticated can read pinterest mode" ON public.pinterest_runtime_settings;

CREATE POLICY "Admins can read pinterest mode"
  ON public.pinterest_runtime_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Dispute attachments: replace permissive INSERT with ownership check
DROP POLICY IF EXISTS "Authenticated users can upload dispute attachments" ON storage.objects;

CREATE POLICY "Customers upload to own dispute attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.disputes d
      JOIN public.profiles p ON p.email = d.customer_email
      WHERE p.id = auth.uid()
        AND (storage.foldername(name))[2] = d.id::text
    )
  );

CREATE POLICY "Admins upload dispute attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-attachments'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
