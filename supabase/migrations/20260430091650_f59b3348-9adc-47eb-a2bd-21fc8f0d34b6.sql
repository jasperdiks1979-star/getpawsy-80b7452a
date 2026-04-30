
ALTER TABLE public.cta_variant_config
  ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_test_variant_a TEXT,
  ADD COLUMN IF NOT EXISTS ab_test_variant_b TEXT,
  ADD COLUMN IF NOT EXISTS ab_test_split_a_pct INTEGER NOT NULL DEFAULT 50
    CHECK (ab_test_split_a_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS ab_test_started_at TIMESTAMPTZ;

-- Seed the v3 vs v2 experiment (disabled by default; admin flips on).
UPDATE public.cta_variant_config
SET ab_test_variant_a = COALESCE(ab_test_variant_a, 'high_conv_v3'),
    ab_test_variant_b = COALESCE(ab_test_variant_b, 'high_conv_v2')
WHERE id = 1;

-- Aggregated CTR per variant since the A/B test started — used by the
-- admin lift dashboard. SECURITY INVOKER so it respects caller's RLS;
-- lp_funnel_events allows authenticated reads.
CREATE OR REPLACE FUNCTION public.cta_ab_test_results()
RETURNS TABLE (
  variant TEXT,
  impressions BIGINT,
  clicks BIGINT,
  ctr_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_a TEXT;
  v_b TEXT;
  v_started TIMESTAMPTZ;
BEGIN
  SELECT ab_test_variant_a, ab_test_variant_b, ab_test_started_at
    INTO v_a, v_b, v_started
  FROM public.cta_variant_config
  WHERE id = 1;

  IF v_a IS NULL OR v_b IS NULL THEN
    RETURN;
  END IF;

  v_started := COALESCE(v_started, now() - INTERVAL '7 days');

  RETURN QUERY
  WITH agg AS (
    SELECT
      e.cta_variant AS variant,
      COUNT(*) FILTER (WHERE e.event_name = 'lp_cta_impression') AS impressions,
      COUNT(*) FILTER (WHERE e.event_name = 'lp_cta_click') AS clicks
    FROM public.lp_funnel_events e
    WHERE e.cta_variant IN (v_a, v_b)
      AND e.is_internal = false
      AND e.created_at >= v_started
      AND e.event_name IN ('lp_cta_impression', 'lp_cta_click')
    GROUP BY e.cta_variant
  )
  SELECT
    a.variant,
    a.impressions,
    a.clicks,
    CASE WHEN a.impressions > 0
         THEN ROUND((a.clicks::NUMERIC / a.impressions::NUMERIC) * 100, 2)
         ELSE 0 END AS ctr_pct
  FROM agg a;
END;
$$;
