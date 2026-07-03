
-- RPC used by attribution-backfill-verify edge function.
CREATE OR REPLACE FUNCTION public.attribution_backfill_reasons_7d()
RETURNS TABLE(reason text, sessions bigint, pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT session_id, utm_source, utm_medium, referrer, classified_channel
    FROM public.canonical_sessions
    WHERE first_seen_at >= now() - interval '7 days'
  ),
  tagged AS (
    SELECT
      CASE
        WHEN utm_source = 'direct' AND utm_medium IN ('(none)','none') THEN 'literal_direct_none_fallback'
        WHEN lower(utm_source) = 'direct' THEN 'utm_source_direct_other_medium'
        WHEN referrer ILIKE '%lovable.dev%' OR referrer ILIKE '%lovable.app%' OR referrer ILIKE '%id-preview--%' THEN 'internal_preview_referrer'
        WHEN referrer ILIKE '%pinterest.com%' AND utm_source IS NULL THEN 'pinterest_untagged'
        WHEN referrer IS NULL AND utm_source IS NULL THEN 'no_ref_no_utm'
        WHEN utm_source IS NULL AND referrer IS NOT NULL THEN 'has_ref_missing_utm'
        WHEN classified_channel IS NULL OR classified_channel = 'unknown' THEN 'classifier_unknown'
        ELSE 'clean'
      END AS reason
    FROM s
  )
  SELECT
    reason,
    count(*) AS sessions,
    round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 2) AS pct
  FROM tagged
  GROUP BY reason
  ORDER BY sessions DESC;
$$;

GRANT EXECUTE ON FUNCTION public.attribution_backfill_reasons_7d() TO authenticated, service_role;

-- Schedule the verification report daily at 06:15 UTC.
DO $$
DECLARE
  fn_url text := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/attribution-backfill-verify';
  secret text := coalesce(current_setting('app.internal_function_secret', true), '');
BEGIN
  PERFORM cron.unschedule('attribution-backfill-verify-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attribution-backfill-verify-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'attribution-backfill-verify-daily',
  '15 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/attribution-backfill-verify',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-internal-secret', current_setting('app.internal_function_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
