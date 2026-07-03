
CREATE TABLE public.stripe_test_checkout_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID REFERENCES auth.users(id),
  admin_email TEXT,
  stripe_session_id TEXT NOT NULL,
  stripe_mode TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  checkout_url TEXT,
  product_id UUID,
  status TEXT NOT NULL DEFAULT 'created',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stripe_test_checkout_log_created_at ON public.stripe_test_checkout_log (created_at DESC);
CREATE INDEX idx_stripe_test_checkout_log_admin ON public.stripe_test_checkout_log (admin_user_id, created_at DESC);

GRANT SELECT ON public.stripe_test_checkout_log TO authenticated;
GRANT ALL ON public.stripe_test_checkout_log TO service_role;

ALTER TABLE public.stripe_test_checkout_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_stripe_test_log"
  ON public.stripe_test_checkout_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
