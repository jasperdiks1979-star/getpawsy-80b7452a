
-- product_global_inventory: replace permissive authenticated read with admin-only
DROP POLICY IF EXISTS "pgi read" ON public.product_global_inventory;
CREATE POLICY "pgi admin read"
  ON public.product_global_inventory
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- shopping_winners: remove public read, admin-only
DROP POLICY IF EXISTS "Public read shopping_winners" ON public.shopping_winners;
CREATE POLICY "shopping_winners admin read"
  ON public.shopping_winners
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.shopping_winners FROM anon;

-- winner_products: replace permissive authenticated read with admin-only
DROP POLICY IF EXISTS "winner_products read" ON public.winner_products;
CREATE POLICY "winner_products admin read"
  ON public.winner_products
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
