CREATE POLICY "Admins can view pinterest connection"
ON public.pinterest_connection
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));