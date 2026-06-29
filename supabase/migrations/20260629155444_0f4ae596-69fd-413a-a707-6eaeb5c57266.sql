CREATE OR REPLACE FUNCTION public.cci_check_atc_click_duplicates()
RETURNS TABLE(dup_sessions integer, dup_pairs integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dup_sessions int := 0;
  v_dup_pairs int := 0;
  v_examples text[];
  v_alert_key text := 'cci_atc_click_duplicates_hourly';
  v_severity text;
BEGIN
  WITH clicks AS (
    SELECT session_id, created_at,
           lag(created_at) OVER (PARTITION BY session_id ORDER BY created_at) AS prev_at
    FROM public.cci_events
    WHERE event_name = 'add_to_cart_click'
      AND created_at > now() - interval '1 hour'
      AND session_id IS NOT NULL
      AND session_id NOT LIKE 'atc-%'
      AND session_id NOT LIKE 'cci-smoke-%'
  ),
  pairs AS (
    SELECT session_id FROM clicks
    WHERE prev_at IS NOT NULL
      AND created_at - prev_at < interval '5 seconds'
  )
  SELECT count(DISTINCT session_id), count(*),
         array_agg(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)
    INTO v_dup_sessions, v_dup_pairs, v_examples
  FROM pairs;

  IF v_dup_pairs > 0 THEN
    v_severity := CASE WHEN v_dup_sessions >= 5 THEN 'high' ELSE 'medium' END;

    INSERT INTO public.monitoring_alerts
      (alert_key, severity, category, title, description, affected_urls,
       suggested_fix, first_detected_at, last_detected_at, is_active, notification_sent)
    VALUES
      (v_alert_key, v_severity, 'analytics',
       'Duplicate add_to_cart_click events detected',
       format('%s sessions emitted %s duplicate add_to_cart_click pairs within 5s in the last hour.',
              v_dup_sessions, v_dup_pairs),
       v_examples[1:20],
       'Inspect ProductDetail.handleAddToCart and any cart hooks that may emit a second click. Dedup fix lives in src/pages/ProductDetail.tsx.',
       now(), now(), true, false)
    ON CONFLICT (alert_key) WHERE is_active
    DO UPDATE SET
      severity = EXCLUDED.severity,
      description = EXCLUDED.description,
      affected_urls = EXCLUDED.affected_urls,
      last_detected_at = now(),
      updated_at = now();
  ELSE
    -- No duplicates in the latest window: auto-resolve any open alert.
    UPDATE public.monitoring_alerts
       SET is_active = false,
           resolved_at = now(),
           updated_at = now()
     WHERE alert_key = v_alert_key
       AND is_active = true;
  END IF;

  RETURN QUERY SELECT v_dup_sessions, v_dup_pairs;
END;
$function$;