
CREATE POLICY "Public read product-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-media');

CREATE POLICY "Admins write product-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-media' AND (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role'));

CREATE POLICY "Admins update product-media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-media' AND (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role'));

CREATE POLICY "Admins delete product-media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-media' AND (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role'));
