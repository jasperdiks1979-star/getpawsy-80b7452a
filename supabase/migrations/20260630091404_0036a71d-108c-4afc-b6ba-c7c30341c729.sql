
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
       'P2',
       'autopilot',
       'First verified purchase — autopilot unlocked',
       format(
         'Order %s (%s %s) triggered the first-sale unlock. Autopilot mode: %s → %s. Pinterest daily cap: %s → %s. TikTok daily cap: %s → %s.',
         v_order, v_amt, v_cur, v_from, v_to, v_pin_b, v_pin_a, v_tt_b, v_tt_a
       ),
       'Review the new BALANCED cadence in Admin → Autopilot Settings and confirm caps are appropriate.',
       true)
    ON CONFLICT (alert_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
