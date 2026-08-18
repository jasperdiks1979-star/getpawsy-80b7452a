-- 1) Covering index so the analytics event scan is index-only (no 53MB heap random reads)
CREATE INDEX IF NOT EXISTS canonical_events_analytics_cover_idx
  ON public.canonical_events (occurred_at DESC)
  INCLUDE (session_id, canonical_name, product_id)
  WHERE coalesce(technical_path, false) = false;

-- 2) Bounded result cache for the historical analytics payload
CREATE TABLE IF NOT EXISTS public.gp_analytics_cache (
  window_hours integer PRIMARY KEY,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  compute_ms integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.gp_analytics_cache TO authenticated;
GRANT ALL ON public.gp_analytics_cache TO service_role;
ALTER TABLE public.gp_analytics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read analytics cache" ON public.gp_analytics_cache;
CREATE POLICY "admins read analytics cache"
  ON public.gp_analytics_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Keep the existing (unchanged) classification logic as the compute function
ALTER FUNCTION public.gp_unified_analytics_v2(integer)
  RENAME TO gp_unified_analytics_v2_compute;

REVOKE ALL ON FUNCTION public.gp_unified_analytics_v2_compute(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gp_unified_analytics_v2_compute(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.gp_unified_analytics_v2_compute(integer) TO authenticated, service_role;

-- 4) Cached entry point used by the dashboard (same name/signature contract)
CREATE OR REPLACE FUNCTION public.gp_unified_analytics_v2(
  p_hours integer DEFAULT 720,
  p_force boolean DEFAULT false,
  p_max_age_seconds integer DEFAULT 120
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

  IF NOT coalesce(p_force, false) THEN
    SELECT c.payload, extract(epoch FROM (now() - c.computed_at))
      INTO v_cached, v_age
    FROM public.gp_analytics_cache c
    WHERE c.window_hours = v_hours;

    IF v_cached IS NOT NULL AND v_age <= greatest(0, coalesce(p_max_age_seconds, 120)) THEN
      RETURN v_cached || jsonb_build_object(
        'cache', jsonb_build_object('hit', true, 'age_seconds', round(v_age))
      );
    END IF;
  END IF;

  v_result := public.gp_unified_analytics_v2_compute(v_hours);
  v_result := v_result || jsonb_build_object(
    'cache', jsonb_build_object('hit', false, 'age_seconds', 0)
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