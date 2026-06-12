
-- 1) product_reviews: hide user_id from anonymous visitors
REVOKE SELECT (user_id) ON public.product_reviews FROM anon;

-- 2) pinterest_connection: hide oauth tokens from admin client reads (service_role keeps full access)
REVOKE SELECT (access_token, refresh_token) ON public.pinterest_connection FROM anon, authenticated;

-- 3) tiktok_oauth_tokens: hide oauth tokens from admin client reads (service_role keeps full access)
REVOKE SELECT (access_token, refresh_token) ON public.tiktok_oauth_tokens FROM anon, authenticated;

-- 4) admin_secrets: explicit service-role-only lock (defense in depth on top of default-deny RLS)
DROP POLICY IF EXISTS "Service role only" ON public.admin_secrets;
CREATE POLICY "Service role only"
  ON public.admin_secrets
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.admin_secrets FROM anon, authenticated;
GRANT ALL ON public.admin_secrets TO service_role;
