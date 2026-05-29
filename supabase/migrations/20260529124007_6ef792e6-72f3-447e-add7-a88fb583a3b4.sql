-- Mirror payment_success rows from checkout_funnel_events into lp_funnel_events
-- so the clean KPI / funnel dashboards (which read lp_funnel_events) reflect
-- server-side conversions written by stripe-webhook. Idempotent via idempotency_key.

CREATE OR REPLACE FUNCTION public.mirror_checkout_payment_success_to_lp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _idem TEXT := 'checkout_mirror:' || NEW.id::text;
BEGIN
  IF NEW.step <> 'payment_success' THEN
    RETURN NEW;
  END IF;

  -- Skip if a prior mirror row already exists for this checkout row
  IF EXISTS (
    SELECT 1 FROM public.lp_funnel_events WHERE idempotency_key = _idem
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lp_funnel_events (
    session_id,
    event_name,
    value,
    source_component,
    idempotency_key,
    is_bot,
    qa,
    classification,
    funnel
  ) VALUES (
    COALESCE(NULLIF(NEW.session_id, ''), NEW.stripe_session_id, 'unknown'),
    'payment_success',
    NEW.value,
    'checkout_funnel_mirror',
    _idem,
    COALESCE(NEW.is_bot, false),
    COALESCE(NEW.qa, false),
    NEW.classification,
    NULL
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let the mirror fail the original webhook insert
  RAISE WARNING 'mirror_checkout_payment_success_to_lp failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_checkout_payment_success ON public.checkout_funnel_events;
CREATE TRIGGER trg_mirror_checkout_payment_success
AFTER INSERT ON public.checkout_funnel_events
FOR EACH ROW
EXECUTE FUNCTION public.mirror_checkout_payment_success_to_lp();

-- Backfill: mirror existing payment_success rows that aren't yet in lp_funnel_events.
INSERT INTO public.lp_funnel_events (
  session_id, event_name, value, source_component,
  idempotency_key, is_bot, qa, classification, created_at
)
SELECT
  COALESCE(NULLIF(c.session_id, ''), c.stripe_session_id, 'unknown'),
  'payment_success',
  c.value,
  'checkout_funnel_mirror',
  'checkout_mirror:' || c.id::text,
  COALESCE(c.is_bot, false),
  COALESCE(c.qa, false),
  c.classification,
  c.created_at
FROM public.checkout_funnel_events c
WHERE c.step = 'payment_success'
  AND NOT EXISTS (
    SELECT 1 FROM public.lp_funnel_events l
    WHERE l.idempotency_key = 'checkout_mirror:' || c.id::text
  );