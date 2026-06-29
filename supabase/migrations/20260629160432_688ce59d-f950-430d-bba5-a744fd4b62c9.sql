
CREATE OR REPLACE FUNCTION public._cci_setting_int(p_key text, p_default int)
RETURNS int LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v text; n int;
BEGIN
  v := current_setting(p_key, true);
  IF v IS NULL OR v = '' THEN RETURN p_default; END IF;
  BEGIN n := v::int; EXCEPTION WHEN others THEN RETURN p_default; END;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public._cci_setting_num(p_key text, p_default numeric)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v text; n numeric;
BEGIN
  v := current_setting(p_key, true);
  IF v IS NULL OR v = '' THEN RETURN p_default; END IF;
  BEGIN n := v::numeric; EXCEPTION WHEN others THEN RETURN p_default; END;
  RETURN n;
END $$;

DROP FUNCTION IF EXISTS public.cci_check_atc_click_duplicates();

CREATE OR REPLACE FUNCTION public.cci_check_atc_click_duplicates()
RETURNS TABLE(
  dup_sessions integer,
  dup_pairs integer,
  total_clicks integer,
  missing_success integer,
  miss_rate_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dup_sessions int := 0;
  v_dup_pairs int := 0;
  v_examples text[];
  v_dup_key text := 'cci_atc_click_duplicates_hourly';
  v_miss_key text := 'cci_atc_success_missing_hourly';
  v_severity text;

  v_total_clicks int := 0;
  v_missing int := 0;
  v_miss_rate numeric := 0;
  v_miss_examples text[];
  v_miss_severity text;

  -- Tunables (env-var style via Postgres GUC settings; safe defaults preserved)
  v_window_seconds   int     := public._cci_setting_int('app.cci_atc_window_seconds', 30);
  v_min_clicks       int     := public._cci_setting_int('app.cci_atc_min_clicks', 10);
  v_miss_warn_pct    numeric := public._cci_setting_num('app.cci_atc_miss_rate_warn', 5);
  v_miss_high_pct    numeric := public._cci_setting_num('app.cci_atc_miss_rate_high', 15);
  v_dup_gap_seconds  int     := public._cci_setting_int('app.cci_atc_dup_gap_seconds', 5);
  v_dup_sess_high    int     := public._cci_setting_int('app.cci_atc_dup_sessions_high', 5);
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
      AND created_at - prev_at < (v_dup_gap_seconds || ' seconds')::interval
  )
  SELECT count(DISTINCT session_id), count(*),
         array_agg(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)
    INTO v_dup_sessions, v_dup_pairs, v_examples
  FROM pairs;

  IF v_dup_pairs > 0 THEN
    v_severity := CASE WHEN v_dup_sessions >= v_dup_sess_high THEN 'high' ELSE 'medium' END;
    INSERT INTO public.monitoring_alerts
      (alert_key, severity, category, title, description, affected_urls,
       suggested_fix, first_detected_at, last_detected_at, is_active, notification_sent)
    VALUES
      (v_dup_key, v_severity, 'analytics',
       'Duplicate add_to_cart_click events detected',
       format('%s sessions emitted %s duplicate add_to_cart_click pairs within %ss in the last hour.',
              v_dup_sessions, v_dup_pairs, v_dup_gap_seconds),
       v_examples[1:20],
       'Inspect ProductDetail.handleAddToCart and any cart hooks that may emit a second click. Dedup fix lives in src/pages/ProductDetail.tsx.',
       now(), now(), true, false)
    ON CONFLICT (alert_key) WHERE is_active
    DO UPDATE SET severity = EXCLUDED.severity,
                  description = EXCLUDED.description,
                  affected_urls = EXCLUDED.affected_urls,
                  last_detected_at = now(),
                  updated_at = now();
  ELSE
    UPDATE public.monitoring_alerts
       SET is_active = false, resolved_at = now(), updated_at = now()
     WHERE alert_key = v_dup_key AND is_active = true;
  END IF;

  WITH real_clicks AS (
    SELECT id, session_id, created_at, product_id,
           lag(created_at) OVER (PARTITION BY session_id ORDER BY created_at) AS prev_at
      FROM public.cci_events
     WHERE event_name = 'add_to_cart_click'
       AND created_at > now() - interval '1 hour'
       AND session_id IS NOT NULL
       AND session_id NOT LIKE 'atc-%'
       AND session_id NOT LIKE 'cci-smoke-%'
  ),
  deduped AS (
    SELECT * FROM real_clicks
     WHERE prev_at IS NULL OR created_at - prev_at >= (v_dup_gap_seconds || ' seconds')::interval
  ),
  evaluated AS (
    SELECT d.id, d.session_id, d.created_at,
           EXISTS (
             SELECT 1 FROM public.cci_events s
              WHERE s.event_name = 'add_to_cart_success'
                AND s.session_id = d.session_id
                AND s.created_at BETWEEN d.created_at
                                     AND d.created_at + (v_window_seconds || ' seconds')::interval
           ) AS has_success,
           EXISTS (
             SELECT 1 FROM public.cci_events e
              WHERE e.event_name = 'add_to_cart_error'
                AND e.session_id = d.session_id
                AND e.created_at BETWEEN d.created_at
                                     AND d.created_at + (v_window_seconds || ' seconds')::interval
           ) AS had_error
      FROM deduped d
     WHERE d.created_at < now() - (v_window_seconds || ' seconds')::interval
  ),
  scored AS (
    SELECT * FROM evaluated WHERE NOT had_error
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE NOT has_success)::int,
         array_agg(session_id) FILTER (WHERE NOT has_success)
    INTO v_total_clicks, v_missing, v_miss_examples
  FROM scored;

  IF v_total_clicks >= v_min_clicks THEN
    v_miss_rate := round((v_missing::numeric / v_total_clicks::numeric) * 100, 2);
  END IF;

  IF v_total_clicks >= v_min_clicks AND v_miss_rate >= v_miss_warn_pct THEN
    v_miss_severity := CASE WHEN v_miss_rate >= v_miss_high_pct THEN 'high' ELSE 'medium' END;
    INSERT INTO public.monitoring_alerts
      (alert_key, severity, category, title, description, affected_urls,
       suggested_fix, first_detected_at, last_detected_at, is_active, notification_sent)
    VALUES
      (v_miss_key, v_miss_severity, 'analytics',
       'add_to_cart_success missing after click',
       format('%s of %s deduplicated add_to_cart_click events (%s%%) had no add_to_cart_success within %ss in the last hour. Thresholds: warn=%s%%, high=%s%%.',
              v_missing, v_total_clicks, v_miss_rate::text, v_window_seconds,
              v_miss_warn_pct::text, v_miss_high_pct::text),
       (SELECT array_agg(DISTINCT s) FROM unnest(v_miss_examples[1:20]) s),
       'Check ProductDetail.handleAddToCart success path, addItem cart store, and cci-ingest delivery for add_to_cart_success. Tune via ALTER DATABASE ... SET app.cci_atc_window_seconds / app.cci_atc_miss_rate_warn / app.cci_atc_miss_rate_high / app.cci_atc_min_clicks / app.cci_atc_dup_gap_seconds / app.cci_atc_dup_sessions_high.',
       now(), now(), true, false)
    ON CONFLICT (alert_key) WHERE is_active
    DO UPDATE SET severity = EXCLUDED.severity,
                  description = EXCLUDED.description,
                  affected_urls = EXCLUDED.affected_urls,
                  last_detected_at = now(),
                  updated_at = now();
  ELSE
    UPDATE public.monitoring_alerts
       SET is_active = false, resolved_at = now(), updated_at = now()
     WHERE alert_key = v_miss_key AND is_active = true;
  END IF;

  RETURN QUERY SELECT v_dup_sessions, v_dup_pairs, v_total_clicks, v_missing, v_miss_rate;
END;
$function$;
