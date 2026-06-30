
-- First-verified-purchase trigger: auto-disable conservative autopilot
-- Creates a function and trigger on public.orders that flips
-- gi_settings.autopilot_mode from AUTO_PUBLISH_CONSERVATIVE to
-- AUTO_PUBLISH_BALANCED the moment the first verified ('paid') order
-- is observed. The flip is logged in governance_decision_log for audit.

CREATE OR REPLACE FUNCTION public.gi_disable_conservative_on_first_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_flipped boolean := false;
BEGIN
  -- Only react to verified (paid) orders
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: only act on the transition into 'paid'
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT autopilot_mode INTO v_mode FROM public.gi_settings WHERE singleton = true LIMIT 1;

  IF v_mode = 'AUTO_PUBLISH_CONSERVATIVE' THEN
    UPDATE public.gi_settings
       SET autopilot_mode = 'AUTO_PUBLISH_BALANCED',
           pinterest_daily_cap = GREATEST(pinterest_daily_cap, 10),
           tiktok_daily_cap = GREATEST(tiktok_daily_cap, 5),
           notes = COALESCE(notes,'') ||
                   E'\n[auto] First verified purchase (' || NEW.id::text ||
                   ') detected at ' || now()::text ||
                   ' — conservative mode disabled.',
           updated_at = now()
     WHERE singleton = true;
    v_flipped := true;
  END IF;

  IF v_flipped THEN
    BEGIN
      INSERT INTO public.governance_decision_log
        (source_engine, decision_type, proposal, expected_metric, expected_value, confidence, dedupe_key)
      VALUES
        ('revenue_brain',
         'autopilot_mode_flip',
         jsonb_build_object(
           'from', 'AUTO_PUBLISH_CONSERVATIVE',
           'to',   'AUTO_PUBLISH_BALANCED',
           'trigger', 'first_verified_purchase',
           'order_id', NEW.id,
           'stripe_session_id', NEW.stripe_session_id,
           'total_amount', NEW.total_amount,
           'currency', NEW.currency
         ),
         'autopilot_unlock',
         1,
         1.0,
         'first_verified_purchase_unlock');
    EXCEPTION WHEN OTHERS THEN
      -- Never block the order on logging failures
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_first_sale_autopilot ON public.orders;
CREATE TRIGGER trg_orders_first_sale_autopilot
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.gi_disable_conservative_on_first_sale();
