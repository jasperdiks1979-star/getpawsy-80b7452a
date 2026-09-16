-- === J/K/L/M commerce state model ===========================================

-- 1. Orders: authoritative payment / fulfillment / refund state -------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'unfulfilled',
  ADD COLUMN IF NOT EXISTS refund_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfillment_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfillment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exception_status text,
  ADD COLUMN IF NOT EXISTS exception_reason text;

-- Backfill from the legacy single `status` column (backward compatible).
UPDATE public.orders SET
  payment_status = CASE
    WHEN status = 'paid' THEN 'paid'
    WHEN status = 'refunded' THEN 'refunded'
    WHEN status = 'failed' THEN 'failed'
    WHEN status = 'expired' THEN 'expired'
    ELSE 'unpaid'
  END,
  fulfillment_status = CASE
    WHEN cj_order_id IS NOT NULL THEN 'fulfillment_created'
    ELSE 'unfulfilled'
  END,
  refund_state = CASE WHEN status = 'refunded' THEN 'refunded_full' ELSE 'none' END,
  paid_at = COALESCE(paid_at, CASE WHEN status IN ('paid','refunded') THEN created_at END),
  fulfilled_at = COALESCE(fulfilled_at, cj_order_created_at)
WHERE payment_status = 'unpaid' AND fulfillment_status = 'unfulfilled';

CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx ON public.orders (fulfillment_status);

-- 2. Exactly-once webhook processing ---------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_session_id text,
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Admins can view stripe webhook events"
  ON public.stripe_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Refund ledger ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stripe_refund_id text UNIQUE,
  stripe_payment_intent_id text,
  idempotency_key text UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  kind text NOT NULL DEFAULT 'partial' CHECK (kind IN ('partial','full')),
  state text NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested','pending','succeeded','failed','canceled')),
  reason text,
  requested_by uuid,
  failure_message text,
  external_confirmed_at timestamptz,
  supplier_cancellation_state text NOT NULL DEFAULT 'not_requested'
    CHECK (supplier_cancellation_state IN ('not_requested','requested','confirmed','rejected','not_applicable')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_refunds_order_id_idx ON public.order_refunds (order_id);
GRANT SELECT ON public.order_refunds TO authenticated;
GRANT ALL ON public.order_refunds TO service_role;
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can view refunds for their own orders" ON public.order_refunds;
CREATE POLICY "Customers can view refunds for their own orders"
  ON public.order_refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_refunds.order_id AND o.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 4. Exception / recovery queue --------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  code text NOT NULL,
  detail text,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','retrying','resolved','manual')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, code)
);
CREATE INDEX IF NOT EXISTS order_exceptions_state_idx ON public.order_exceptions (state, next_attempt_at);
GRANT SELECT ON public.order_exceptions TO authenticated;
GRANT ALL ON public.order_exceptions TO service_role;
ALTER TABLE public.order_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can view exceptions for their own orders" ON public.order_exceptions;
CREATE POLICY "Customers can view exceptions for their own orders"
  ON public.order_exceptions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_exceptions.order_id AND o.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
DROP POLICY IF EXISTS "Admins can manage order exceptions" ON public.order_exceptions;
CREATE POLICY "Admins can manage order exceptions"
  ON public.order_exceptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Atomic fulfillment claim ----------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_order_fulfillment(p_order_id uuid)
RETURNS TABLE (claimed boolean, reason text, fulfillment_state text, cj_order_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'order_not_found'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_row.payment_status <> 'paid' THEN
    RETURN QUERY SELECT false, 'not_paid'::text, v_row.fulfillment_status, v_row.cj_order_id;
    RETURN;
  END IF;

  IF v_row.cj_order_id IS NOT NULL
     OR v_row.fulfillment_status IN ('fulfillment_created','shipped','delivered','claimed') THEN
    RETURN QUERY SELECT false, 'already_fulfilled'::text, v_row.fulfillment_status, v_row.cj_order_id;
    RETURN;
  END IF;

  UPDATE public.orders
     SET fulfillment_status = 'claimed',
         fulfillment_claimed_at = now(),
         fulfillment_attempts = v_row.fulfillment_attempts + 1,
         updated_at = now()
   WHERE id = p_order_id;

  RETURN QUERY SELECT true, 'claimed'::text, 'claimed'::text, NULL::text;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_order_fulfillment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_order_fulfillment(uuid) TO service_role;

-- 6. updated_at triggers ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_order_refunds_updated_at ON public.order_refunds;
CREATE TRIGGER update_order_refunds_updated_at BEFORE UPDATE ON public.order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_order_exceptions_updated_at ON public.order_exceptions;
CREATE TRIGGER update_order_exceptions_updated_at BEFORE UPDATE ON public.order_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_stripe_webhook_events_updated_at ON public.stripe_webhook_events;
CREATE TRIGGER update_stripe_webhook_events_updated_at BEFORE UPDATE ON public.stripe_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();