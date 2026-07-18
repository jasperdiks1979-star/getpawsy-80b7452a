
CREATE OR REPLACE VIEW public.commercial_sessions
WITH (security_invoker = true) AS
SELECT
  cs.*,
  COALESCE(NULLIF(TRIM(cs.country), ''), 'Unknown') AS country_display
FROM public.canonical_sessions cs
WHERE cs.is_internal IS NOT TRUE
  AND cs.is_bot IS NOT TRUE
  AND cs.technical_path IS NOT TRUE
  AND cs.exclude_from_commercial IS NOT TRUE
  AND (
    cs.traffic_quality IN ('confirmed_human','probable_human','human')
    OR cs.traffic_class IN (
      'CONFIRMED_HUMAN','PROBABLE_HUMAN',
      'HUMAN_CONFIRMED','HUMAN_PROBABLE'
    )
    OR cs.traffic_class IS NULL -- unclassified but not internal/bot/technical/excluded → include, err on real
  );

GRANT SELECT ON public.commercial_sessions TO authenticated;
GRANT SELECT ON public.commercial_sessions TO service_role;
