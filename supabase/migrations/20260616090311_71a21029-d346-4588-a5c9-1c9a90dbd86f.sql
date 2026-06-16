
-- Restrict merchant OAuth tables to service_role only
DROP POLICY IF EXISTS "Only admins can manage merchant tokens" ON public.merchant_oauth_tokens;
DROP POLICY IF EXISTS "Only admins can manage oauth state" ON public.merchant_oauth_state;

CREATE POLICY "Service role manages merchant tokens"
  ON public.merchant_oauth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages merchant oauth state"
  ON public.merchant_oauth_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.merchant_oauth_tokens FROM authenticated, anon;
REVOKE ALL ON public.merchant_oauth_state FROM authenticated, anon;
GRANT ALL ON public.merchant_oauth_tokens TO service_role;
GRANT ALL ON public.merchant_oauth_state TO service_role;

-- Realtime channel authorization: restrict subscriptions to admins
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can subscribe to realtime channels" ON realtime.messages;
CREATE POLICY "Admins can subscribe to realtime channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
