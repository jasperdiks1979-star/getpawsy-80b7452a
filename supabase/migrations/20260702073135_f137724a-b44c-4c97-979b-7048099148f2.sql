DROP POLICY IF EXISTS "read certs" ON public.genesis_boardroom_certifications;
CREATE POLICY "Admins can read boardroom certifications"
ON public.genesis_boardroom_certifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));