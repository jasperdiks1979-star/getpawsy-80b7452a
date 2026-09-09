CREATE OR REPLACE FUNCTION public.analytics_canonical_session_agg_json(
  p_since timestamptz,
  p_until timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM public.analytics_canonical_session_agg(p_since, p_until) t
$$;

REVOKE ALL ON FUNCTION public.analytics_canonical_session_agg_json(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_canonical_session_agg_json(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_canonical_session_agg_json(timestamptz, timestamptz) TO postgres;