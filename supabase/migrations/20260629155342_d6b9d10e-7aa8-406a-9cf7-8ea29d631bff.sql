-- 1) Funnel completeness check for geo-unknown users (last 60 minutes)
CREATE OR REPLACE FUNCTION public.cci_check_geo_unknown_funnel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz := now() - interval '1 hour';
  v_geo_sessions uuid[];
  v_views_n int := 0;
  v_click_sessions int := 0;
  v_success_sessions int := 0;
  v_view_sessions int := 0;
  v_click_rate numeric := 0;
  v_success_rate numeric := 0;
  v_click_to_success numeric := 0;
  v_severity text := NULL;
  v_title text;
  v_desc text;
  v_alert_key text := 'cci_geo_unknown_funnel_degraded';
  v_result jsonb;
BEGIN
  -- A session counts as "geo-unknown" if it emitted either a geo_lookup_failed
  -- event in the window, OR an add_to_cart_click whose meta marks shipping as
  -- unknown_pending_checkout (soft geo fallback path).
  SELECT array_agg(DISTINCT session_id)
    INTO v_geo_sessions
  FROM public.cci_events
  WHERE created_at >= v_window_start
    AND session_id IS NOT NULL
    AND (
      event_name = 'geo_lookup_failed'
      OR (
        event_name = 'add_to_cart_click'
        AND meta ->> 'shipping_eligibility' = 'unknown_pending_checkout'
      )
    );

  IF v_geo_sessions IS NULL OR array_length(v_geo_sessions, 1) IS NULL THEN
    -- No geo-unknown traffic this hour: auto-resolve any open alert and exit.
    UPDATE public.monitoring_alerts
       SET is_active = false,
           resolved_at = now(),
           updated_at = now()
     WHERE alert_key = v_alert_key
       AND is_active = true;
    RETURN jsonb_build_object(
      'ok', true,
      'window_start', v_window_start,
      'geo_unknown_sessions', 0,
      'note', 'no_geo_unknown_traffic'
    );
  END IF;

  SELECT
    count(*) FILTER (WHERE event_name = 'product_view'),
    count(DISTINCT session_id) FILTER (WHERE event_name = 'product_view'),
    count(DISTINCT session_id) FILTER (WHERE event_name = 'add_to_cart_click'),
    count(DISTINCT session_id) FILTER (WHERE event_name = 'add_to_cart_success')
    INTO v_views_n, v_view_sessions, v_click_sessions, v_success_sessions
  FROM public.cci_events
  WHERE created_at >= v_window_start
    AND session_id = ANY(v_geo_sessions)
    AND event_name IN ('product_view','add_to_cart_click','add_to_cart_success');

  v_click_rate       := CASE WHEN v_view_sessions  > 0 THEN v_click_sessions::numeric  / v_view_sessions  ELSE 0 END;
  v_success_rate     := CASE WHEN v_view_sessions  > 0 THEN v_success_sessions::numeric / v_view_sessions  ELSE 0 END;
  v_click_to_success := CASE WHEN v_click_sessions > 0 THEN v_success_sessions::numeric / v_click_sessions ELSE 0 END;

  -- Severity ladder. Only alert when there is meaningful traffic (>= 5 view sessions).
  IF v_view_sessions >= 5 THEN
    IF v_click_to_success < 0.80 OR v_success_rate < 0.05 THEN
      v_severity := 'high';
    ELSIF v_click_rate < 0.25 OR v_success_rate < 0.10 THEN
      v_severity := 'medium';
    ELSIF v_click_to_success < 0.95 THEN
      v_severity := 'low';
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'geo_unknown_sessions', array_length(v_geo_sessions, 1),
    'view_sessions', v_view_sessions,
    'click_sessions', v_click_sessions,
    'success_sessions', v_success_sessions,
    'product_views', v_views_n,
    'click_rate', round(v_click_rate, 4),
    'success_rate', round(v_success_rate, 4),
    'click_to_success', round(v_click_to_success, 4),
    'severity', v_severity
  );

  IF v_severity IS NOT NULL THEN
    v_title := format(
      'Geo-unknown funnel degraded (%s): %s/%s click, %s/%s success',
      v_severity, v_click_sessions, v_view_sessions, v_success_sessions, v_view_sessions
    );
    v_desc := format(
      'Last 60 min, geo-unknown shoppers. Click rate %s%%, success rate %s%%, click→success %s%%. Affected sessions: %s.',
      round(v_click_rate * 100, 1),
      round(v_success_rate * 100, 1),
      round(v_click_to_success * 100, 1),
      array_length(v_geo_sessions, 1)
    );

    INSERT INTO public.monitoring_alerts (
      alert_key, severity, category, title, description,
      first_detected_at, last_detected_at, is_active
    ) VALUES (
      v_alert_key, v_severity, 'conversion_funnel', v_title, v_desc,
      now(), now(), true
    )
    ON CONFLICT (alert_key) WHERE is_active
    DO UPDATE SET
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      last_detected_at = now(),
      updated_at = now();
  ELSE
    -- Recovered: close any open alert.
    UPDATE public.monitoring_alerts
       SET is_active = false,
           resolved_at = now(),
           updated_at = now()
     WHERE alert_key = v_alert_key
       AND is_active = true;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cci_check_geo_unknown_funnel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cci_check_geo_unknown_funnel() TO service_role;

-- 2) Schedule it every hour at minute 12 (offset from the dup monitor at :07).
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'cci-geo-unknown-funnel-monitor';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'cci-geo-unknown-funnel-monitor',
  '12 * * * *',
  $$ SELECT public.cci_check_geo_unknown_funnel(); $$
);