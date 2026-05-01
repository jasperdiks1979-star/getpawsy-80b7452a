-- 1. Default for function_name on new rows
ALTER TABLE public.monitoring_runs
  ALTER COLUMN function_name SET DEFAULT 'unknown';

-- 2. Backfill historical rows
UPDATE public.monitoring_runs
SET function_name = COALESCE(function_name, run_type, 'unknown')
WHERE function_name IS NULL;

UPDATE public.monitoring_runs
SET status = CASE WHEN success IS TRUE THEN 'success'
                  WHEN success IS FALSE THEN 'error'
                  ELSE 'unknown' END
WHERE status IS NULL;

UPDATE public.monitoring_runs
SET watches_total = COALESCE(watches_total, checks_passed + checks_failed)
WHERE watches_total IS NULL;

UPDATE public.monitoring_runs
SET watches_unhealthy = COALESCE(watches_unhealthy, checks_failed)
WHERE watches_unhealthy IS NULL;

-- 3. Retention function — drop rows older than 30 days
CREATE OR REPLACE FUNCTION public.purge_old_monitoring_runs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.monitoring_runs
  WHERE started_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 4. Meta-watch — opens an alert when the heartbeat itself stops
CREATE OR REPLACE FUNCTION public.check_heartbeat_liveness()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_run TIMESTAMPTZ;
  silence_min INTEGER;
  threshold_min INTEGER := 90;
  alert_key_v TEXT := 'monitoring_heartbeat_dead';
BEGIN
  SELECT MAX(started_at) INTO last_run
  FROM public.monitoring_runs
  WHERE function_name = 'monitoring-tracking-heartbeat';

  silence_min := COALESCE(EXTRACT(EPOCH FROM (NOW() - last_run))::INTEGER / 60, 99999);

  IF last_run IS NULL OR silence_min >= threshold_min THEN
    INSERT INTO public.monitoring_alerts (alert_key, severity, category, title, description,
                                           affected_urls, suggested_fix, last_detected_at, is_active)
    VALUES (
      alert_key_v, 'P1', 'tracking',
      'Heartbeat monitor is dead',
      format('De monitoring-tracking-heartbeat functie heeft sinds %s minuten geen run meer geregistreerd (drempel %s).',
             silence_min, threshold_min),
      ARRAY['https://getpawsy.pet/admin/monitoring-runs',
            'https://getpawsy.pet/admin/tracking-alerts-history'],
      'Check pg_cron job invoke-monitoring-heartbeat en de Supabase edge function logs voor monitoring-tracking-heartbeat.',
      NOW(), TRUE
    )
    ON CONFLICT (alert_key) DO UPDATE SET
      is_active = TRUE,
      last_detected_at = NOW(),
      description = EXCLUDED.description;
    RETURN jsonb_build_object('healthy', false, 'silence_min', silence_min, 'last_run', last_run);
  ELSE
    UPDATE public.monitoring_alerts
       SET is_active = FALSE, resolved_at = NOW(), notification_sent = FALSE
     WHERE alert_key = alert_key_v AND is_active = TRUE;
    RETURN jsonb_build_object('healthy', true, 'silence_min', silence_min, 'last_run', last_run);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_monitoring_runs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_heartbeat_liveness() FROM PUBLIC;