
CREATE OR REPLACE FUNCTION public.canonical_ingest_recent_logged(hours int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id uuid;
  started timestamptz := now();
  result jsonb;
  total int;
BEGIN
  INSERT INTO public.cron_job_logs (job_name, started_at, status)
  VALUES ('canonical-ingest-recent', started, 'running')
  RETURNING id INTO log_id;

  BEGIN
    result := public.canonical_ingest_recent(hours);
    total := COALESCE((result->>'cci')::int,0)
           + COALESCE((result->>'checkout_funnel')::int,0)
           + COALESCE((result->>'orders')::int,0);
    UPDATE public.cron_job_logs
    SET completed_at = now(),
        status = 'completed',
        success = true,
        items_processed = total,
        items_failed = 0,
        details = result
    WHERE id = log_id;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_logs
    SET completed_at = now(),
        status = 'completed',
        success = false,
        items_processed = 0,
        items_failed = 1,
        error_message = SQLERRM,
        details = jsonb_build_object('sqlstate', SQLSTATE)
    WHERE id = log_id;
    RAISE;
  END;
END $$;

REVOKE ALL ON FUNCTION public.canonical_ingest_recent_logged(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_ingest_recent_logged(int) TO service_role;

-- Reschedule cron to use logged wrapper
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'canonical-ingest-recent-3min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'canonical-ingest-recent-3min',
  '*/3 * * * *',
  $$ SELECT public.canonical_ingest_recent_logged(1); $$
);

-- Health view for dashboard / monitor
CREATE OR REPLACE FUNCTION public.canonical_ingest_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_run AS (
    SELECT * FROM public.cron_job_logs
    WHERE job_name = 'canonical-ingest-recent'
    ORDER BY started_at DESC LIMIT 1
  ),
  last_success AS (
    SELECT * FROM public.cron_job_logs
    WHERE job_name = 'canonical-ingest-recent' AND success = true
    ORDER BY started_at DESC LIMIT 1
  ),
  window_stats AS (
    SELECT
      count(*) FILTER (WHERE started_at > now() - interval '1 hour') AS runs_1h,
      count(*) FILTER (WHERE started_at > now() - interval '1 hour' AND success = false) AS failures_1h,
      COALESCE(SUM(items_processed) FILTER (WHERE started_at > now() - interval '1 hour'), 0) AS rows_1h,
      COALESCE(SUM(items_processed) FILTER (WHERE started_at > now() - interval '24 hours'), 0) AS rows_24h
    FROM public.cron_job_logs
    WHERE job_name = 'canonical-ingest-recent'
  )
  SELECT jsonb_build_object(
    'job_name', 'canonical-ingest-recent',
    'last_run_at', (SELECT started_at FROM last_run),
    'last_run_success', (SELECT success FROM last_run),
    'last_run_error', (SELECT error_message FROM last_run),
    'last_run_items', (SELECT items_processed FROM last_run),
    'last_run_details', (SELECT details FROM last_run),
    'last_success_at', (SELECT started_at FROM last_success),
    'minutes_since_last_run', EXTRACT(EPOCH FROM (now() - (SELECT started_at FROM last_run))) / 60,
    'minutes_since_last_success', EXTRACT(EPOCH FROM (now() - (SELECT started_at FROM last_success))) / 60,
    'runs_1h', (SELECT runs_1h FROM window_stats),
    'failures_1h', (SELECT failures_1h FROM window_stats),
    'rows_ingested_1h', (SELECT rows_1h FROM window_stats),
    'rows_ingested_24h', (SELECT rows_24h FROM window_stats),
    'status', CASE
      WHEN (SELECT started_at FROM last_run) IS NULL THEN 'unknown'
      WHEN (SELECT started_at FROM last_run) < now() - interval '10 minutes' THEN 'stale'
      WHEN (SELECT failures_1h FROM window_stats) >= 3 THEN 'failing'
      WHEN (SELECT success FROM last_run) = false THEN 'failing'
      ELSE 'healthy'
    END
  );
$$;

REVOKE ALL ON FUNCTION public.canonical_ingest_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_ingest_health() TO authenticated, service_role;
