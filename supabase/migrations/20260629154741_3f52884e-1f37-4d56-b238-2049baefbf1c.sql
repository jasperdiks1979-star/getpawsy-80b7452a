
CREATE OR REPLACE FUNCTION public.cci_check_atc_click_duplicates()
RETURNS TABLE(dup_sessions int, dup_pairs int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_sessions int := 0;
  v_dup_pairs int := 0;
  v_examples text[];
BEGIN
  WITH clicks AS (
    SELECT session_id, created_at,
           lag(created_at) OVER (PARTITION BY session_id ORDER BY created_at) AS prev_at
    FROM public.cci_events
    WHERE event_name = 'add_to_cart_click'
      AND created_at > now() - interval '1 hour'
      AND session_id IS NOT NULL
      AND session_id NOT LIKE 'atc-%'         -- ignore smoke tests
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
    INSERT INTO public.monitoring_alerts
      (alert_key, severity, category, title, description, affected_urls,
       suggested_fix, first_detected_at, last_detected_at, is_active, notification_sent)
    VALUES
      ('cci_atc_click_duplicates_hourly',
       CASE WHEN v_dup_sessions >= 5 THEN 'high' ELSE 'medium' END,
       'analytics',
       'Duplicate add_to_cart_click events detected',
       format('%s sessions emitted %s duplicate add_to_cart_click pairs within 5s in the last hour.',
              v_dup_sessions, v_dup_pairs),
       v_examples[1:20],
       'Inspect ProductDetail.handleAddToCart and any cart hooks that may emit a second click. Dedup fix lives in src/pages/ProductDetail.tsx.',
       now(), now(), true, false)
    ON CONFLICT (alert_key) WHERE is_active DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_dup_sessions, v_dup_pairs;
END;
$$;

REVOKE ALL ON FUNCTION public.cci_check_atc_click_duplicates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cci_check_atc_click_duplicates() TO service_role;

-- Partial unique index so ON CONFLICT works while alert is open
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_alerts_active_key_uidx
  ON public.monitoring_alerts (alert_key) WHERE is_active;

-- Hourly cron
SELECT cron.unschedule('cci-atc-click-dup-monitor')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cci-atc-click-dup-monitor');

SELECT cron.schedule(
  'cci-atc-click-dup-monitor',
  '7 * * * *',
  $$ SELECT public.cci_check_atc_click_duplicates(); $$
);
