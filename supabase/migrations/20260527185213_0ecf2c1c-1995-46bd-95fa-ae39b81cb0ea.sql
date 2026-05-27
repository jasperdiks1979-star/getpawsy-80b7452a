
CREATE TABLE IF NOT EXISTS public.smoke_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  payment_intent_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','failed','expired')),
  webhook_received_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_id TEXT,
  session_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smoke_test_runs_created_at
  ON public.smoke_test_runs (created_at DESC);

GRANT SELECT ON public.smoke_test_runs TO authenticated;
GRANT ALL ON public.smoke_test_runs TO service_role;

ALTER TABLE public.smoke_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view smoke test runs"
ON public.smoke_test_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_smoke_test_runs_updated_at
BEFORE UPDATE ON public.smoke_test_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
