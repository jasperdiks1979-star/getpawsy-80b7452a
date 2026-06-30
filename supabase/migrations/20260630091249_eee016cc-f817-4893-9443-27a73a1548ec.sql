
-- 1) Enrich the upstream trigger function to record before/after caps in proposal
CREATE OR REPLACE FUNCTION public.gi_disable_conservative_on_first_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode_before text;
  v_pin_before int;
  v_tt_before int;
  v_mode_after text;
  v_pin_after int;
  v_tt_after int;
  v_flipped boolean := false;
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT autopilot_mode, pinterest_daily_cap, tiktok_daily_cap
    INTO v_mode_before, v_pin_before, v_tt_before
    FROM public.gi_settings WHERE singleton = true LIMIT 1;

  IF v_mode_before = 'AUTO_PUBLISH_CONSERVATIVE' THEN
    UPDATE public.gi_settings
       SET autopilot_mode = 'AUTO_PUBLISH_BALANCED',
           pinterest_daily_cap = GREATEST(pinterest_daily_cap, 10),
           tiktok_daily_cap = GREATEST(tiktok_daily_cap, 5),
           notes = COALESCE(notes,'') ||
                   E'\n[auto] First verified purchase (' || NEW.id::text ||
                   ') detected at ' || now()::text ||
                   ' — conservative mode disabled.',
           updated_at = now()
     WHERE singleton = true
    RETURNING autopilot_mode, pinterest_daily_cap, tiktok_daily_cap
      INTO v_mode_after, v_pin_after, v_tt_after;
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
           'from', v_mode_before,
           'to',   v_mode_after,
           'trigger', 'first_verified_purchase',
           'order_id', NEW.id,
           'stripe_session_id', NEW.stripe_session_id,
           'total_amount', NEW.total_amount,
           'currency', NEW.currency,
           'caps_before', jsonb_build_object('pinterest', v_pin_before, 'tiktok', v_tt_before),
           'caps_after',  jsonb_build_object('pinterest', v_pin_after,  'tiktok', v_tt_after)
         ),
         'autopilot_unlock',
         1,
         1.0,
         'first_verified_purchase_unlock');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Notification trigger on governance_decision_log -> monitoring_alerts
CREATE OR REPLACE FUNCTION public.notify_first_sale_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from text := COALESCE(NEW.proposal->>'from','?');
  v_to   text := COALESCE(NEW.proposal->>'to','?');
  v_pin_b text := COALESCE(NEW.proposal#>>'{caps_before,pinterest}','?');
  v_pin_a text := COALESCE(NEW.proposal#>>'{caps_after,pinterest}','?');
  v_tt_b  text := COALESCE(NEW.proposal#>>'{caps_before,tiktok}','?');
  v_tt_a  text := COALESCE(NEW.proposal#>>'{caps_after,tiktok}','?');
  v_order text := COALESCE(NEW.proposal->>'order_id','?');
  v_amt   text := COALESCE(NEW.proposal->>'total_amount','?');
  v_cur   text := COALESCE(NEW.proposal->>'currency','');
BEGIN
  IF NEW.dedupe_key <> 'first_verified_purchase_unlock' THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.monitoring_alerts
      (alert_key, severity, category, title, description, suggested_fix, is_active)
    VALUES
      ('first_verified_purchase_unlock:' || NEW.id::text,
       'info',
       'autopilot',
       '🎉 First verified purchase — autopilot unlocked',
       format(
         'Order %s (%s %s) triggered the first-sale unlock. Autopilot mode: %s → %s. Pinterest daily cap: %s → %s. TikTok daily cap: %s → %s.',
         v_order, v_amt, v_cur, v_from, v_to, v_pin_b, v_pin_a, v_tt_b, v_tt_a
       ),
       'Review the new BALANCED cadence in Admin → Autopilot Settings and confirm caps are appropriate.',
       true);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- never block the ledger insert
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gov_log_notify_first_sale ON public.governance_decision_log;
CREATE TRIGGER trg_gov_log_notify_first_sale
AFTER INSERT ON public.governance_decision_log
FOR EACH ROW EXECUTE FUNCTION public.notify_first_sale_unlock();
