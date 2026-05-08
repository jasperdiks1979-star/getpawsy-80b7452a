CREATE OR REPLACE FUNCTION public.pinterest_publish_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  status_counts jsonb;
  recent_logs record;
  last_run record;
  last_success record;
  cron_runs_24h int;
  cron_success_24h int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT jsonb_object_agg(status, c) INTO status_counts
  FROM (
    SELECT status, COUNT(*)::int AS c
    FROM public.pinterest_pin_queue
    GROUP BY status
  ) s;

  SELECT
    COUNT(*)::int AS attempts,
    COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
    AVG(duration_ms)::int AS avg_ms
  INTO recent_logs
  FROM (
    SELECT status, duration_ms FROM public.pinterest_publish_logs
    ORDER BY created_at DESC LIMIT 50
  ) l;

  SELECT * INTO last_run
  FROM public.cron_job_logs
  WHERE job_name = 'pinterest-cron-publish'
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT * INTO last_success
  FROM public.cron_job_logs
  WHERE job_name = 'pinterest-cron-publish' AND success = true
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE success = true)::int
  INTO cron_runs_24h, cron_success_24h
  FROM public.cron_job_logs
  WHERE job_name = 'pinterest-cron-publish'
    AND started_at > now() - interval '24 hours'
    AND status <> 'running';

  result := jsonb_build_object(
    'queue_counts', COALESCE(status_counts, '{}'::jsonb),
    'recent_attempts', COALESCE(recent_logs.attempts, 0),
    'recent_successes', COALESCE(recent_logs.successes, 0),
    'avg_publish_ms', COALESCE(recent_logs.avg_ms, 0),
    'last_cron_run_at', last_run.started_at,
    'last_cron_status', last_run.status,
    'last_cron_success', last_run.success,
    'last_cron_duration_ms', COALESCE((last_run.details->>'duration_ms')::int, NULL),
    'last_cron_processed', last_run.items_processed,
    'last_cron_failed', last_run.items_failed,
    'last_cron_error', last_run.error_message,
    'last_cron_message', last_run.details->>'message',
    'last_success_at', last_success.started_at,
    'cron_runs_24h', COALESCE(cron_runs_24h, 0),
    'cron_success_24h', COALESCE(cron_success_24h, 0),
    'generated_at', now()
  );

  RETURN result;
END;
$function$;