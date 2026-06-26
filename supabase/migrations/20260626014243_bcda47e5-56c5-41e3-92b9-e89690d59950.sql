-- PCIE2 GLOBAL PUBLISHING KILL SWITCH
-- Sets the flag every legacy publisher reads, AND unschedules every cron job
-- whose name suggests it can publish, promote, drain, recover, or post pins.
-- Read-only & analytics crons are left alone.

INSERT INTO public.app_config (key, value)
VALUES ('pinterest_publishing_global_stop', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();

-- Snapshot + disable matching cron jobs
DO $$
DECLARE r record;
BEGIN
  CREATE TABLE IF NOT EXISTS public.pinterest_cron_disabled_snapshot (
    jobid bigint PRIMARY KEY,
    jobname text NOT NULL,
    schedule text,
    command text,
    disabled_at timestamptz NOT NULL DEFAULT now(),
    reason text
  );
  FOR r IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE active = true
      AND (
        jobname ~* '(publish|promote|drain|recover|emergency|pin[-_]?worker|publisher|growth.*tick|autopilot.*(run|scheduler)|video.*tick|cron.*worker)'
      )
      AND jobname !~* '(analytics|metrics|sync|audit|health|monitor|score|report|cleanup|learn|attribution)'
  LOOP
    BEGIN
      INSERT INTO public.pinterest_cron_disabled_snapshot(jobid, jobname, schedule, command, reason)
      VALUES (r.jobid, r.jobname, r.schedule, r.command, 'pcie2_global_stop')
      ON CONFLICT (jobid) DO NOTHING;
      PERFORM cron.unschedule(r.jobid);
      RAISE NOTICE 'Unscheduled cron % (%)', r.jobname, r.jobid;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to unschedule %: %', r.jobname, SQLERRM;
    END;
  END LOOP;
END $$;

GRANT SELECT ON public.pinterest_cron_disabled_snapshot TO authenticated;
GRANT ALL ON public.pinterest_cron_disabled_snapshot TO service_role;
ALTER TABLE public.pinterest_cron_disabled_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read cron snapshot" ON public.pinterest_cron_disabled_snapshot;
CREATE POLICY "admins read cron snapshot" ON public.pinterest_cron_disabled_snapshot
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));