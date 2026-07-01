
CREATE POLICY "evidence vault admin all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='evidence-vault' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id='evidence-vault' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "evidence vault accountant auditor read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='evidence-vault' AND (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role)));
