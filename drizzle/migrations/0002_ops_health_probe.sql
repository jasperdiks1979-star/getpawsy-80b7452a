-- lovable-cron-fallback-reviewed: DB outage/gap detection is inherently time-based; DB already runs 24/7 with ~280 jobs; probe uses only indexed/tiny reads.
CREATE TABLE IF NOT EXISTS public.ops_health_probe_log (
  id bigserial PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  postmaster_start timestamptz,
  connections int, long_tx int, lock_waiters int,
  page_views_2h int, session_quality_6h int,
  gap_minutes numeric,
  alerts text[] NOT NULL DEFAULT '{}'
);
GRANT SELECT ON public.ops_health_probe_log TO authenticated;
GRANT ALL ON public.ops_health_probe_log TO service_role;
ALTER TABLE public.ops_health_probe_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ops health" ON public.ops_health_probe_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.ops_health_probe_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='10s' AS $$
DECLARE
  v_start timestamptz := pg_postmaster_start_time();
  v_prev record; v_conn int; v_ltx int; v_lw int; v_pv int; v_sq int; v_gap numeric;
  v_alerts text[] := '{}';
  v_keys text[] := array['ops_health:db_restart','ops_health:db_gap','ops_health:connections','ops_health:db_contention','ops_health:page_views','ops_health:session_quality'];
  k text;
BEGIN
  SELECT * INTO v_prev FROM public.ops_health_probe_log ORDER BY id DESC LIMIT 1;
  SELECT count(*) INTO v_conn FROM pg_stat_activity;
  SELECT count(*) INTO v_ltx FROM pg_stat_activity WHERE xact_start < now()-interval '60 seconds' AND state <> 'idle';
  SELECT count(*) INTO v_lw FROM pg_stat_activity WHERE wait_event_type='Lock';
  SELECT count(*) INTO v_pv FROM public.cci_events WHERE event_name='page_view' AND created_at > now()-interval '2 hours';
  SELECT count(*) INTO v_sq FROM public.analytics_session_quality WHERE created_at > now()-interval '6 hours';
  v_gap := CASE WHEN v_prev.id IS NULL THEN NULL ELSE round(extract(epoch FROM now()-v_prev.checked_at)/60,1) END;

  IF v_prev.id IS NOT NULL AND v_prev.postmaster_start IS DISTINCT FROM v_start THEN v_alerts := v_alerts || 'ops_health:db_restart'; END IF;
  IF v_gap > 40 THEN v_alerts := v_alerts || 'ops_health:db_gap'; END IF;
  IF v_conn > 45 THEN v_alerts := v_alerts || 'ops_health:connections'; END IF;
  IF v_ltx > 2 OR v_lw > 3 THEN v_alerts := v_alerts || 'ops_health:db_contention'; END IF;
  IF v_pv = 0 THEN v_alerts := v_alerts || 'ops_health:page_views'; END IF;
  IF v_sq = 0 THEN v_alerts := v_alerts || 'ops_health:session_quality'; END IF;

  INSERT INTO public.ops_health_probe_log(postmaster_start,connections,long_tx,lock_waiters,page_views_2h,session_quality_6h,gap_minutes,alerts)
  VALUES (v_start,v_conn,v_ltx,v_lw,v_pv,v_sq,v_gap,v_alerts);

  FOREACH k IN ARRAY v_keys LOOP
    IF k = ANY(v_alerts) THEN
      INSERT INTO public.canonical_consistency_alerts(alert_key,severity,metric,actual,details)
      VALUES (k, CASE WHEN k IN ('ops_health:db_restart','ops_health:db_gap','ops_health:connections') THEN 'high' ELSE 'warning' END,
              replace(k,'ops_health:',''), CASE k WHEN 'ops_health:connections' THEN v_conn WHEN 'ops_health:page_views' THEN v_pv WHEN 'ops_health:session_quality' THEN v_sq WHEN 'ops_health:db_gap' THEN v_gap ELSE NULL END,
              jsonb_build_object('source','ops_health_probe','conn',v_conn,'long_tx',v_ltx,'lock_waiters',v_lw,'gap_min',v_gap))
      ON CONFLICT (alert_key) DO UPDATE SET is_active=true, severity=EXCLUDED.severity, actual=EXCLUDED.actual, details=EXCLUDED.details, last_detected_at=now(), resolved_at=NULL;
    ELSE
      UPDATE public.canonical_consistency_alerts SET is_active=false, resolved_at=now() WHERE alert_key=k AND is_active;
    END IF;
  END LOOP;

  DELETE FROM public.ops_health_probe_log WHERE checked_at < now()-interval '14 days';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ops_health_probe_tick failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.ops_health_probe_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('ops-health-probe-15min','4,19,34,49 * * * *','SELECT public.ops_health_probe_tick()');