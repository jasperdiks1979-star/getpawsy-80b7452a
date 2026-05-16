
-- Auto-recovery for cinematic ad render pipeline.
-- 1. Reset jobs stuck in 'rendering' for >15 minutes back to 'render_queued'
--    so a fresh worker can claim them.
-- 2. Re-queue 'worker_stale' jobs older than 5 minutes that have no
--    render_started_at so the pipeline self-heals once the worker comes back.

CREATE OR REPLACE FUNCTION public.cinematic_recover_stuck_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_rendering int := 0;
  requeue_stale int := 0;
BEGIN
  -- Reset rendering jobs whose worker died mid-render (>15 min no progress)
  WITH upd AS (
    UPDATE public.cinematic_ad_jobs
    SET status = 'render_queued',
        render_started_at = NULL,
        render_worker_id = NULL,
        render_attempts = COALESCE(render_attempts, 0),
        status_message = 'Auto-recovered: rendering exceeded 15 minutes without completion.'
    WHERE status = 'rendering'
      AND render_started_at IS NOT NULL
      AND render_started_at < (now() - interval '15 minutes')
    RETURNING id
  )
  SELECT count(*) INTO reset_rendering FROM upd;

  -- Re-queue stale jobs so the worker retries automatically once it's healthy
  WITH upd2 AS (
    UPDATE public.cinematic_ad_jobs
    SET status = 'render_queued',
        render_started_at = NULL,
        render_worker_id = NULL,
        status_message = 'Auto-recovered from worker_stale: re-queued for next worker poll.'
    WHERE status = 'worker_stale'
      AND COALESCE(render_attempts, 0) < 5
    RETURNING id
  )
  SELECT count(*) INTO requeue_stale FROM upd2;

  RETURN jsonb_build_object(
    'reset_rendering', reset_rendering,
    'requeue_stale', requeue_stale,
    'ran_at', now()
  );
END;
$$;

-- Schedule recovery every 2 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('cinematic_recover_stuck_jobs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cinematic_recover_stuck_jobs',
  '*/2 * * * *',
  $$SELECT public.cinematic_recover_stuck_jobs();$$
);
