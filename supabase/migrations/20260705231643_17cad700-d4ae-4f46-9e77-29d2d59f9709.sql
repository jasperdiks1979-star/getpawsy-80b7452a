DROP POLICY IF EXISTS "read registry" ON public.genesis_boardroom_widgets_registry;
CREATE POLICY "Admins can read registry"
ON public.genesis_boardroom_widgets_registry
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));