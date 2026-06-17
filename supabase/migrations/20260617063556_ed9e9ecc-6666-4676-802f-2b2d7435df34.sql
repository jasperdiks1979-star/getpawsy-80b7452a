
-- Pinterest scheduler health: expose cron.job_run_details safely
CREATE OR REPLACE FUNCTION public.pinterest_scheduler_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb) FROM (
    SELECT j.jobname,
           j.schedule,
           j.active,
           (
             SELECT max(d.start_time) FROM cron.job_run_details d
             WHERE d.jobid = j.jobid
           ) AS last_run,
           (
             SELECT max(d.start_time) FROM cron.job_run_details d
             WHERE d.jobid = j.jobid AND d.status = 'succeeded'
           ) AS last_success,
           (
             SELECT count(*) FROM cron.job_run_details d
             WHERE d.jobid = j.jobid AND d.start_time > now() - interval '2 hours'
               AND d.status = 'failed'
           ) AS fails_2h,
           (
             SELECT count(*) FROM cron.job_run_details d
             WHERE d.jobid = j.jobid AND d.start_time > now() - interval '2 hours'
               AND d.status = 'succeeded'
           ) AS succ_2h
    FROM cron.job j
    WHERE j.jobname IN (
      'pinterest-autopilot-scheduler-15min',
      'pinterest-cron-publish',
      'pinterest-flow-monitor-10min',
      'pinterest-regen-autopilot-30m',
      'pinterest-draft-promoter-10min',
      'pinterest-autopilot-watchdog-10min'
    )
  ) row;
$$;

GRANT EXECUTE ON FUNCTION public.pinterest_scheduler_health() TO authenticated, service_role;
