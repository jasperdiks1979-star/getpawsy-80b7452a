
-- Tighten orders SELECT: require non-null user_id so guest orders (user_id NULL) cannot be read
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- pinterest_pins: remove broad anon read; keep admin-managed
DROP POLICY IF EXISTS "Public can read pinterest pins" ON public.pinterest_pins;

-- product_aliases: lock down public read to authenticated admins
DROP POLICY IF EXISTS product_aliases_public_read ON public.product_aliases;
CREATE POLICY product_aliases_admin_read
  ON public.product_aliases FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- product_slug_history: lock down public read to authenticated admins
DROP POLICY IF EXISTS slug_history_public_read ON public.product_slug_history;
CREATE POLICY slug_history_admin_read
  ON public.product_slug_history FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
