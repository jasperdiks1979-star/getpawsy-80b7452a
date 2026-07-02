
-- ============================================================================
-- CJIE Phase 1: extend analytics_session_quality with 7 behavioural counters
-- ============================================================================
ALTER TABLE public.analytics_session_quality
  ADD COLUMN IF NOT EXISTS mouse_movement_density integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scroll_velocity_avg integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_density integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idle_time_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hesitation_events integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoom_uses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_gallery_uses integer DEFAULT 0;

-- ============================================================================
-- CJIE Phase 1: cjie_session_journeys - compact per-session narrative
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cjie_session_journeys (
  session_id                 text PRIMARY KEY,
  visitor_id                 text,
  first_seen                 timestamptz NOT NULL,
  last_seen                  timestamptz NOT NULL,
  duration_ms                bigint NOT NULL DEFAULT 0,
  page_count                 integer NOT NULL DEFAULT 0,
  event_count                integer NOT NULL DEFAULT 0,
  stage_sequence             text[] NOT NULL DEFAULT '{}',
  product_ids                text[] NOT NULL DEFAULT '{}',
  entry_page                 text,
  exit_page                  text,
  device                     text,
  browser                    text,
  country                    text,
  region                     text,
  city                       text,
  language                   text,
  timezone                   text,
  screen_wxh                 text,
  returning_visitor          boolean NOT NULL DEFAULT false,
  new_visitor                boolean NOT NULL DEFAULT true,
  classified_channel         text,
  intent_class               text,
  intent_confidence          numeric,
  intent_evidence            jsonb NOT NULL DEFAULT '[]'::jsonb,
  abandonment_reason         text,
  abandonment_confidence     numeric,
  abandonment_evidence       jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust_interactions         jsonb NOT NULL DEFAULT '{}'::jsonb,
  checkout_interactions      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reached_purchase           boolean NOT NULL DEFAULT false,
  reached_checkout           boolean NOT NULL DEFAULT false,
  reached_atc                boolean NOT NULL DEFAULT false,
  narrative_hash             text NOT NULL,
  built_at                   timestamptz NOT NULL DEFAULT now(),
  built_from_events_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cjie_session_journeys TO authenticated;
GRANT ALL    ON public.cjie_session_journeys TO service_role;

ALTER TABLE public.cjie_session_journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cjie_journeys admin read" ON public.cjie_session_journeys;
CREATE POLICY "cjie_journeys admin read"
  ON public.cjie_session_journeys FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "cjie_journeys service all" ON public.cjie_session_journeys;
CREATE POLICY "cjie_journeys service all"
  ON public.cjie_session_journeys FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS cjie_journeys_last_seen_idx  ON public.cjie_session_journeys (last_seen DESC);
CREATE INDEX IF NOT EXISTS cjie_journeys_intent_idx     ON public.cjie_session_journeys (intent_class);
CREATE INDEX IF NOT EXISTS cjie_journeys_abandon_idx    ON public.cjie_session_journeys (abandonment_reason);
CREATE INDEX IF NOT EXISTS cjie_journeys_channel_idx    ON public.cjie_session_journeys (classified_channel);
CREATE INDEX IF NOT EXISTS cjie_journeys_visitor_idx    ON public.cjie_session_journeys (visitor_id);

-- ============================================================================
-- CJIE Phase 2/3: evidence-only classifiers (single build function inlines them)
-- ============================================================================

-- ============================================================================
-- CJIE Phase 1: cjie_build_journeys - deterministic aggregator
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cjie_build_journeys(p_since timestamptz DEFAULT (now() - interval '24 hours'))
RETURNS TABLE(sessions_built integer, sessions_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
BEGIN
  WITH
  event_agg AS (
    SELECT
      e.session_id,
      MIN(e.occurred_at) AS first_seen,
      MAX(e.occurred_at) AS last_seen,
      COUNT(*) AS event_count,
      COUNT(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PAGE_VIEW') AS page_count,
      array_agg(DISTINCT e.canonical_name::text ORDER BY e.canonical_name::text) AS stages,
      array_agg(DISTINCT e.product_id) FILTER (WHERE e.product_id IS NOT NULL) AS product_ids,
      (array_agg(e.page_path ORDER BY e.occurred_at ASC))[1] AS entry_page,
      (array_agg(e.page_path ORDER BY e.occurred_at DESC))[1] AS exit_page,
      bool_or(e.canonical_name = 'CANONICAL_PURCHASE') AS reached_purchase,
      bool_or(e.canonical_name = 'CANONICAL_CHECKOUT') AS reached_checkout,
      bool_or(e.canonical_name = 'CANONICAL_ADD_TO_CART') AS reached_atc,
      COUNT(DISTINCT e.product_id) FILTER (WHERE e.product_id IS NOT NULL AND e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS distinct_product_views
    FROM public.canonical_events e
    WHERE e.session_id IS NOT NULL
      AND e.occurred_at >= p_since
    GROUP BY e.session_id
  ),
  trust_agg AS (
    SELECT
      c.session_id,
      jsonb_object_agg(c.event_name, cnt) AS trust_interactions
    FROM (
      SELECT session_id, event_name, COUNT(*) AS cnt
      FROM public.cci_events
      WHERE event_name LIKE 'trust_%'
        AND created_at >= p_since - interval '1 hour'
      GROUP BY session_id, event_name
    ) c
    GROUP BY c.session_id
  ),
  checkout_agg AS (
    SELECT
      f.session_id,
      jsonb_object_agg(f.step, cnt) AS checkout_interactions
    FROM (
      SELECT session_id, step, COUNT(*) AS cnt
      FROM public.checkout_funnel_events
      WHERE created_at >= p_since - interval '1 hour'
        AND session_id IS NOT NULL
      GROUP BY session_id, step
    ) f
    GROUP BY f.session_id
  ),
  prior_purchase AS (
    SELECT DISTINCT visitor_id
    FROM public.canonical_events
    WHERE canonical_name = 'CANONICAL_PURCHASE'
      AND occurred_at < p_since
      AND occurred_at >= (now() - interval '90 days')
      AND visitor_id IS NOT NULL
  ),
  base AS (
    SELECT
      ea.*,
      s.visitor_id,
      s.classified_channel,
      s.device,
      s.browser,
      s.country,
      s.region,
      s.city,
      s.language,
      s.timezone,
      s.screen_wxh,
      COALESCE(sq.max_scroll_pct, 0)          AS max_scroll_pct,
      COALESCE(sq.checkout_exits, 0)          AS checkout_exits,
      COALESCE(sq.variant_selections, 0)      AS variant_selections,
      COALESCE(sq.coupon_attempts, 0)         AS coupon_attempts,
      COALESCE(sq.search_uses, 0)             AS search_uses,
      COALESCE(sq.filter_uses, 0)             AS filter_uses,
      COALESCE(sq.rage_clicks, 0)             AS rage_clicks,
      COALESCE(sq.dead_clicks, 0)             AS dead_clicks,
      COALESCE(pp.visitor_id IS NOT NULL, false) AS is_returning_buyer,
      t.trust_interactions,
      c.checkout_interactions
    FROM event_agg ea
    LEFT JOIN public.canonical_sessions s        ON s.session_id = ea.session_id
    LEFT JOIN public.analytics_session_quality sq ON sq.session_id = ea.session_id
    LEFT JOIN prior_purchase pp                  ON pp.visitor_id = s.visitor_id
    LEFT JOIN trust_agg t                        ON t.session_id = ea.session_id
    LEFT JOIN checkout_agg c                     ON c.session_id = ea.session_id
  ),
  classified AS (
    SELECT
      b.*,
      -- intent classification (evidence-first)
      CASE
        WHEN b.reached_purchase                                        THEN 'Buyer'
        WHEN b.reached_checkout AND b.checkout_exits > 0               THEN 'Checkout Hesitation'
        WHEN b.reached_atc AND NOT b.reached_purchase                  THEN 'Abandoned Cart'
        WHEN b.is_returning_buyer AND b.distinct_product_views >= 1    THEN 'Returning Customer'
        WHEN b.distinct_product_views >= 3 AND b.filter_uses >= 1      THEN 'Comparison Shopper'
        WHEN b.distinct_product_views >= 3 OR (b.max_scroll_pct > 75 AND b.reached_atc)
                                                                       THEN 'High Purchase Intent'
        WHEN b.distinct_product_views >= 2 AND b.max_scroll_pct >= 50  THEN 'Research Visitor'
        WHEN b.distinct_product_views = 1                              THEN 'Window Shopper'
        WHEN b.page_count = 1 AND b.event_count <= 2                   THEN 'Low Intent'
        ELSE 'Unknown'
      END AS intent_class,
      CASE
        WHEN b.reached_purchase                                        THEN 1.00
        WHEN b.reached_checkout AND b.checkout_exits > 0               THEN 0.92
        WHEN b.reached_atc                                             THEN 0.85
        WHEN b.is_returning_buyer                                      THEN 0.80
        WHEN b.distinct_product_views >= 3                             THEN 0.75
        WHEN b.distinct_product_views >= 2                             THEN 0.65
        WHEN b.distinct_product_views = 1                              THEN 0.55
        ELSE 0.40
      END AS intent_confidence,
      -- abandonment reason (only for non-buyers)
      CASE
        WHEN b.reached_purchase                                        THEN NULL
        WHEN b.checkout_exits > 0                                      THEN 'Checkout'
        WHEN b.reached_atc AND b.variant_selections >= 3               THEN 'Variant Confusion'
        WHEN b.reached_atc AND b.coupon_attempts >= 1                  THEN 'Price'
        WHEN b.reached_atc                                             THEN 'Abandoned Cart'
        WHEN b.search_uses >= 1 AND b.distinct_product_views = 0       THEN 'Search Failure'
        WHEN b.page_count >= 5 AND b.distinct_product_views = 0        THEN 'Navigation'
        WHEN b.rage_clicks >= 3 OR b.dead_clicks >= 5                  THEN 'Performance'
        WHEN b.distinct_product_views >= 1 AND b.max_scroll_pct < 25   THEN 'Product Information'
        WHEN b.page_count = 1                                          THEN 'Low Intent'
        ELSE 'Unknown'
      END AS abandonment_reason,
      CASE
        WHEN b.reached_purchase                                        THEN NULL
        WHEN b.checkout_exits > 0                                      THEN 0.90
        WHEN b.reached_atc AND b.variant_selections >= 3               THEN 0.80
        WHEN b.reached_atc AND b.coupon_attempts >= 1                  THEN 0.75
        WHEN b.reached_atc                                             THEN 0.70
        WHEN b.search_uses >= 1 AND b.distinct_product_views = 0       THEN 0.75
        WHEN b.rage_clicks >= 3                                        THEN 0.75
        ELSE 0.45
      END AS abandonment_confidence
    FROM base b
  ),
  upsert AS (
    INSERT INTO public.cjie_session_journeys AS j (
      session_id, visitor_id, first_seen, last_seen, duration_ms,
      page_count, event_count, stage_sequence, product_ids,
      entry_page, exit_page,
      device, browser, country, region, city, language, timezone, screen_wxh,
      returning_visitor, new_visitor, classified_channel,
      intent_class, intent_confidence, intent_evidence,
      abandonment_reason, abandonment_confidence, abandonment_evidence,
      trust_interactions, checkout_interactions,
      reached_purchase, reached_checkout, reached_atc,
      narrative_hash, built_at, built_from_events_at
    )
    SELECT
      c.session_id,
      c.visitor_id,
      c.first_seen,
      c.last_seen,
      GREATEST(0, EXTRACT(EPOCH FROM (c.last_seen - c.first_seen)) * 1000)::bigint,
      COALESCE(c.page_count, 0),
      COALESCE(c.event_count, 0),
      COALESCE(c.stages, '{}'::text[]),
      COALESCE(c.product_ids, '{}'::text[]),
      c.entry_page,
      c.exit_page,
      c.device, c.browser, c.country, c.region, c.city, c.language, c.timezone, c.screen_wxh,
      c.is_returning_buyer,
      NOT c.is_returning_buyer,
      c.classified_channel,
      c.intent_class,
      c.intent_confidence,
      jsonb_build_array(
        jsonb_build_object('signal','distinct_product_views','value',c.distinct_product_views),
        jsonb_build_object('signal','max_scroll_pct','value',c.max_scroll_pct),
        jsonb_build_object('signal','reached_atc','value',c.reached_atc),
        jsonb_build_object('signal','reached_checkout','value',c.reached_checkout),
        jsonb_build_object('signal','reached_purchase','value',c.reached_purchase)
      ),
      c.abandonment_reason,
      c.abandonment_confidence,
      jsonb_build_array(
        jsonb_build_object('signal','checkout_exits','value',c.checkout_exits),
        jsonb_build_object('signal','variant_selections','value',c.variant_selections),
        jsonb_build_object('signal','coupon_attempts','value',c.coupon_attempts),
        jsonb_build_object('signal','search_uses','value',c.search_uses),
        jsonb_build_object('signal','rage_clicks','value',c.rage_clicks),
        jsonb_build_object('signal','dead_clicks','value',c.dead_clicks)
      ),
      COALESCE(c.trust_interactions, '{}'::jsonb),
      COALESCE(c.checkout_interactions, '{}'::jsonb),
      COALESCE(c.reached_purchase, false),
      COALESCE(c.reached_checkout, false),
      COALESCE(c.reached_atc, false),
      encode(sha256(convert_to(
        c.session_id || '|' || c.intent_class || '|' || COALESCE(c.abandonment_reason,'ok') || '|' || c.event_count::text,
        'UTF8')), 'hex'),
      now(),
      c.last_seen
    FROM classified c
    ON CONFLICT (session_id) DO UPDATE SET
      last_seen              = EXCLUDED.last_seen,
      duration_ms            = EXCLUDED.duration_ms,
      page_count             = EXCLUDED.page_count,
      event_count            = EXCLUDED.event_count,
      stage_sequence         = EXCLUDED.stage_sequence,
      product_ids            = EXCLUDED.product_ids,
      exit_page              = EXCLUDED.exit_page,
      classified_channel     = COALESCE(EXCLUDED.classified_channel, j.classified_channel),
      intent_class           = EXCLUDED.intent_class,
      intent_confidence      = EXCLUDED.intent_confidence,
      intent_evidence        = EXCLUDED.intent_evidence,
      abandonment_reason     = EXCLUDED.abandonment_reason,
      abandonment_confidence = EXCLUDED.abandonment_confidence,
      abandonment_evidence   = EXCLUDED.abandonment_evidence,
      trust_interactions     = EXCLUDED.trust_interactions,
      checkout_interactions  = EXCLUDED.checkout_interactions,
      reached_purchase       = EXCLUDED.reached_purchase,
      reached_checkout       = EXCLUDED.reached_checkout,
      reached_atc            = EXCLUDED.reached_atc,
      narrative_hash         = EXCLUDED.narrative_hash,
      built_at               = now(),
      built_from_events_at   = EXCLUDED.built_from_events_at
    RETURNING (xmax = 0) AS inserted
  )
  SELECT
    COUNT(*) FILTER (WHERE inserted)         AS sessions_built,
    COUNT(*) FILTER (WHERE NOT inserted)     AS sessions_updated
  INTO v_inserted, v_updated
  FROM upsert;

  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.cjie_build_journeys(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cjie_build_journeys(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.cjie_build_journeys(timestamptz) TO authenticated;

-- ============================================================================
-- CJIE Phase 4: v_product_journey_health
-- ============================================================================
CREATE OR REPLACE VIEW public.v_product_journey_health AS
WITH per_product AS (
  SELECT
    e.product_id,
    COUNT(DISTINCT e.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS views,
    COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS unique_viewers,
    COUNT(DISTINCT e.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_ADD_TO_CART')  AS atc_sessions,
    COUNT(DISTINCT e.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_CHECKOUT')     AS checkout_sessions,
    COUNT(DISTINCT e.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_PURCHASE')     AS purchase_sessions,
    COALESCE(SUM(e.value_cents) FILTER (WHERE e.canonical_name = 'CANONICAL_PURCHASE'), 0)  AS revenue_cents
  FROM public.canonical_events e
  WHERE e.product_id IS NOT NULL
    AND e.occurred_at >= now() - interval '30 days'
  GROUP BY e.product_id
)
SELECT
  product_id,
  views,
  unique_viewers,
  atc_sessions,
  checkout_sessions,
  purchase_sessions,
  revenue_cents,
  CASE WHEN views > 0 THEN ROUND(100.0 * atc_sessions      / views, 2) ELSE 0 END AS atc_rate_pct,
  CASE WHEN views > 0 THEN ROUND(100.0 * checkout_sessions / views, 2) ELSE 0 END AS checkout_rate_pct,
  CASE WHEN views > 0 THEN ROUND(100.0 * purchase_sessions / views, 2) ELSE 0 END AS purchase_rate_pct,
  GREATEST(atc_sessions - purchase_sessions, 0) AS lost_after_atc,
  CASE WHEN views >= 20 THEN 'high' WHEN views >= 5 THEN 'medium' ELSE 'low' END AS confidence
FROM per_product
ORDER BY revenue_cents DESC, views DESC;

GRANT SELECT ON public.v_product_journey_health TO authenticated, service_role;

-- ============================================================================
-- CJIE Phase 4: v_journey_paths_top (aggregated stage sequences)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_journey_paths_top AS
SELECT
  array_to_string(stage_sequence, ' → ') AS path,
  reached_purchase,
  COUNT(*) AS sessions,
  ROUND(AVG(duration_ms)::numeric / 1000, 1) AS avg_duration_sec,
  COUNT(*) FILTER (WHERE reached_purchase) AS purchases,
  CASE WHEN COUNT(*) > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE reached_purchase) / COUNT(*), 2)
       ELSE 0 END AS conversion_pct
FROM public.cjie_session_journeys
WHERE last_seen >= now() - interval '30 days'
  AND array_length(stage_sequence, 1) IS NOT NULL
GROUP BY stage_sequence, reached_purchase
HAVING COUNT(*) >= 2
ORDER BY sessions DESC
LIMIT 100;

GRANT SELECT ON public.v_journey_paths_top TO authenticated, service_role;
