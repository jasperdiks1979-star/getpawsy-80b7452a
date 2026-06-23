
-- cta_copy_winners: admin-only read
DROP POLICY IF EXISTS "Anyone can read cta copy winners" ON public.cta_copy_winners;
CREATE POLICY "Admins read cta copy winners"
  ON public.cta_copy_winners FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- cta_copy_winners_by_hook: admin-only read
DROP POLICY IF EXISTS "cta_copy_winners_by_hook_public_read" ON public.cta_copy_winners_by_hook;
CREATE POLICY "Admins read cta copy winners by hook"
  ON public.cta_copy_winners_by_hook FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- cta_variant_config: admin-only read
DROP POLICY IF EXISTS "Anyone can read CTA variant config" ON public.cta_variant_config;
CREATE POLICY "Admins read CTA variant config"
  ON public.cta_variant_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- product_media: restrict public read to video rows only (used by storefront).
-- Admins/service role still manage all rows via the existing ALL policy.
DROP POLICY IF EXISTS "Public can view product media" ON public.product_media;
CREATE POLICY "Public can view product videos"
  ON public.product_media FOR SELECT
  TO anon, authenticated
  USING (media_type = 'video');
