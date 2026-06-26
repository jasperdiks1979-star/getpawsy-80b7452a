
INSERT INTO public.app_config(key, value) VALUES ('pinterest_video_auto_publish', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb;
INSERT INTO public.app_config(key, value) VALUES ('PINTEREST_VIDEO_AUTO_PUBLISH', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobid, jobname, schedule, command FROM cron.job
           WHERE jobname ILIKE '%video-queue-drain%'
              OR jobname ILIKE '%video-publisher%'
              OR jobname ILIKE '%pinterest-video%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
    INSERT INTO public.pinterest_cron_disabled_snapshot(jobid, jobname, schedule, command, disabled_at, reason)
    VALUES (r.jobid, r.jobname, r.schedule, r.command, now(),
            'Wave Omega forensic — closed video-drain bypass of pinterest_publishing_global_stop')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
