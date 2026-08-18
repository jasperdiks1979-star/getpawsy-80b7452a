-- Background warmer so the dashboard never computes the heavy payload inline.
CREATE OR REPLACE FUNCTION public.gp_analytics_cache_refresh(p_windows integer[] DEFAULT ARRAY[24,168,720,2160])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '240s'
AS $function$
DECLARE
  v_h integer;
  v_payload jsonb;
  v_started timestamptz;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOREACH v_h IN ARRAY coalesce(p_windows, ARRAY[24,168,720,2160]) LOOP
    BEGIN
      v_started := clock_timestamp();
      v_payload := public.gp_unified_analytics_v2_compute(v_h);
      INSERT INTO public.gp_analytics_cache (window_hours, payload, computed_at, compute_ms)
      VALUES (v_h, v_payload, now(), (extract(epoch FROM (clock_timestamp() - v_started)) * 1000)::int)
      ON CONFLICT (window_hours) DO UPDATE
        SET payload = excluded.payload,
            computed_at = excluded.computed_at,
            compute_ms = excluded.compute_ms;
      v_out := v_out || jsonb_build_object('window_hours', v_h, 'ok', true,
                 'ms', (extract(epoch FROM (clock_timestamp() - v_started)) * 1000)::int);
    EXCEPTION WHEN OTHERS THEN
      v_out := v_out || jsonb_build_object('window_hours', v_h, 'ok', false, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('refreshed_at', now(), 'results', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.gp_analytics_cache_refresh(integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gp_analytics_cache_refresh(integer[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.gp_analytics_cache_refresh(integer[]) TO service_role;

-- Serve-from-cache entry point with graceful degradation on slow/failed recompute.
CREATE OR REPLACE FUNCTION public.gp_unified_analytics_v2(
  p_hours integer DEFAULT 720,
  p_force boolean DEFAULT false,
  p_max_age_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer := greatest(1, least(coalesce(p_hours, 720), 8760));
  v_result jsonb;
  v_cached jsonb;
  v_age numeric;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT c.payload, extract(epoch FROM (now() - c.computed_at))
    INTO v_cached, v_age
  FROM public.gp_analytics_cache c
  WHERE c.window_hours = v_hours;

  IF NOT coalesce(p_force, false)
     AND v_cached IS NOT NULL
     AND v_age <= greatest(0, coalesce(p_max_age_seconds, 900)) THEN
    RETURN v_cached || jsonb_build_object(
      'cache', jsonb_build_object('hit', true, 'stale', false, 'age_seconds', round(v_age))
    );
  END IF;

  BEGIN
    v_result := public.gp_unified_analytics_v2_compute(v_hours);
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the whole dashboard: serve the last good payload, flagged as stale.
    IF v_cached IS NOT NULL THEN
      RETURN v_cached || jsonb_build_object(
        'cache', jsonb_build_object('hit', true, 'stale', true,
                                    'age_seconds', round(v_age), 'error', SQLERRM)
      );
    END IF;
    RAISE;
  END;

  v_result := v_result || jsonb_build_object(
    'cache', jsonb_build_object('hit', false, 'stale', false, 'age_seconds', 0)
  );

  INSERT INTO public.gp_analytics_cache (window_hours, payload, computed_at, compute_ms)
  VALUES (v_hours, v_result, now(),
          (extract(epoch FROM (clock_timestamp() - v_started)) * 1000)::int)
  ON CONFLICT (window_hours) DO UPDATE
    SET payload = excluded.payload,
        computed_at = excluded.computed_at,
        compute_ms = excluded.compute_ms;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.gp_unified_analytics_v2(integer, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gp_unified_analytics_v2(integer, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.gp_unified_analytics_v2(integer, boolean, integer) TO authenticated, service_role;