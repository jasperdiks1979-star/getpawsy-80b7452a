DROP POLICY IF EXISTS "Service role only" ON public.rate_limits;
CREATE POLICY "Service role manages rate limits" ON public.rate_limits
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');