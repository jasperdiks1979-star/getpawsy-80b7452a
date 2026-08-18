CREATE OR REPLACE FUNCTION public.gp_analytics_admin_gate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Background/service context has no JWT subject; interactive callers must be admin.
  SELECT auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin');
$$;

DO $do$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'gp_unified_analytics_v2_compute';

  v_src := replace(v_src,
    'IF NOT public.has_role(auth.uid(), ''admin'') THEN',
    'IF NOT public.gp_analytics_admin_gate() THEN');

  EXECUTE v_src;
END
$do$;

SELECT public.gp_analytics_cache_refresh(ARRAY[24,168,720,2160]);