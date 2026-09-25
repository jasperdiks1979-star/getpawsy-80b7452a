DROP POLICY IF EXISTS "auth read cv" ON public.catalog_classification_variants;
CREATE POLICY "Admins read cv" ON public.catalog_classification_variants FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "auth read runs" ON public.catalog_classification_runs;
CREATE POLICY "Admins read runs" ON public.catalog_classification_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Public read product-media cj videos only" ON storage.objects;
CREATE POLICY "Admins read product-media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-media' AND public.has_role(auth.uid(), 'admin'::app_role));