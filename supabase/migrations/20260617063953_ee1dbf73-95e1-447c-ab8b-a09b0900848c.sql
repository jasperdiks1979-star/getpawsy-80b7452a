
CREATE OR REPLACE FUNCTION public.pinterest_scheduler_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  WITH jobs AS (
    SELECT jobid, jobname, schedule, active
    FROM cron.job
    WHERE jobname IN (
      'pinterest-autopilot-scheduler-15min',
      'pinterest-cron-publish',
      'pinterest-flow-monitor-10min',
      'pinterest-regen-autopilot-30m',
      'pinterest-draft-promoter-10min',
      'pinterest-autopilot-watchdog-10min'
    )
  ),
  recent AS (
    SELECT d.jobid, d.status, d.start_time
    FROM cron.job_run_details d
    JOIN jobs USING (jobid)
    WHERE d.start_time > now() - interval '6 hours'
  ),
  agg AS (
    SELECT j.jobid, j.jobname, j.schedule, j.active,
           max(r.start_time) AS last_run,
           max(r.start_time) FILTER (WHERE r.status='succeeded') AS last_success,
           count(*) FILTER (WHERE r.status='failed' AND r.start_time > now()-interval '2 hours') AS fails_2h,
           count(*) FILTER (WHERE r.status='succeeded' AND r.start_time > now()-interval '2 hours') AS succ_2h
    FROM jobs j
    LEFT JOIN recent r ON r.jobid = j.jobid
    GROUP BY j.jobid, j.jobname, j.schedule, j.active
  )
  SELECT coalesce(jsonb_agg(to_jsonb(agg) - 'jobid'), '[]'::jsonb) FROM agg;
$$;
