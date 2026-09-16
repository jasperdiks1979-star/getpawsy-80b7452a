ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_attempt_id text,
  ADD COLUMN IF NOT EXISTS fulfillment_warehouse text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_attempt_id_key
  ON public.orders (checkout_attempt_id) WHERE checkout_attempt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (claimed boolean, reason text, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.stripe_webhook_events%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.stripe_webhook_events
   WHERE event_id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.stripe_webhook_events
      (event_id, event_type, stripe_session_id, status, attempts, last_attempt_at, lease_expires_at)
    VALUES
      (p_event_id, p_event_type, p_session_id, 'processing', 1, now(),
       now() + make_interval(secs => p_lease_seconds));
    RETURN QUERY SELECT true, 'claimed_new'::text, 1;
    RETURN;
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN QUERY SELECT false, 'already_processed'::text, v_row.attempts;
    RETURN;
  END IF;

  IF v_row.status = 'processing'
     AND v_row.lease_expires_at IS NOT NULL
     AND v_row.lease_expires_at > now() THEN
    RETURN QUERY SELECT false, 'lease_active'::text, v_row.attempts;
    RETURN;
  END IF;

  UPDATE public.stripe_webhook_events
     SET status = 'processing',
         attempts = v_row.attempts + 1,
         last_attempt_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   WHERE event_id = p_event_id;

  RETURN QUERY SELECT true,
    CASE WHEN v_row.status = 'failed' THEN 'retry_after_failure' ELSE 'stale_lease_recovered' END,
    v_row.attempts + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, text, integer) TO service_role;