
-- =============================================================
-- Genesis V2.5 — Canonical Analytics Wave 1
-- =============================================================

-- 1) Enums --------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.canonical_event_name AS ENUM (
    'CANONICAL_PAGE_VIEW',
    'CANONICAL_PRODUCT_VIEW',
    'CANONICAL_ADD_TO_CART',
    'CANONICAL_CART',
    'CANONICAL_CHECKOUT',
    'CANONICAL_PURCHASE',
    'CANONICAL_ENGAGEMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.canonical_source_system AS ENUM (
    'cci','cie','lp_funnel','checkout_funnel','orders','ga4','stripe','pinterest','tiktok','meta'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) canonical_events --------------------------------------------
CREATE TABLE IF NOT EXISTS public.canonical_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_name  public.canonical_event_name NOT NULL,
  source_system   public.canonical_source_system NOT NULL,
  source_event_id TEXT,
  visitor_id      TEXT,
  session_id      TEXT,
  ga_client_id    TEXT,
  stripe_session_id TEXT,
  order_id        UUID,
  product_id      TEXT,
  page_path       TEXT,
  landing_page    TEXT,
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  utm_term        TEXT,
  country         TEXT,
  city            TEXT,
  device          TEXT,
  browser         TEXT,
  os              TEXT,
  value_cents     BIGINT,
  currency        TEXT,
  dedup_key       TEXT NOT NULL,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT canonical_events_dedup_key_uniq UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS canonical_events_occurred_at_idx ON public.canonical_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS canonical_events_canonical_name_occurred_idx ON public.canonical_events (canonical_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS canonical_events_session_idx ON public.canonical_events (session_id);
CREATE INDEX IF NOT EXISTS canonical_events_product_idx ON public.canonical_events (product_id);
CREATE INDEX IF NOT EXISTS canonical_events_source_system_idx ON public.canonical_events (source_system, occurred_at DESC);
CREATE INDEX IF NOT EXISTS canonical_events_order_idx ON public.canonical_events (order_id) WHERE order_id IS NOT NULL;

GRANT SELECT ON public.canonical_events TO authenticated;
GRANT ALL    ON public.canonical_events TO service_role;

ALTER TABLE public.canonical_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canonical_events admin read" ON public.canonical_events;
CREATE POLICY "canonical_events admin read"
  ON public.canonical_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) canonical_sessions ------------------------------------------
CREATE TABLE IF NOT EXISTS public.canonical_sessions (
  session_id      TEXT PRIMARY KEY,
  visitor_id      TEXT,
  ga_client_id    TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ NOT NULL,
  landing_page    TEXT,
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  utm_term        TEXT,
  country         TEXT,
  city            TEXT,
  device          TEXT,
  browser         TEXT,
  os              TEXT,
  last_stage      public.canonical_event_name,
  order_id        UUID,
  stripe_session_id TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canonical_sessions_last_seen_idx ON public.canonical_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS canonical_sessions_visitor_idx ON public.canonical_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS canonical_sessions_order_idx ON public.canonical_sessions (order_id) WHERE order_id IS NOT NULL;

GRANT SELECT ON public.canonical_sessions TO authenticated;
GRANT ALL    ON public.canonical_sessions TO service_role;

ALTER TABLE public.canonical_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canonical_sessions admin read" ON public.canonical_sessions;
CREATE POLICY "canonical_sessions admin read"
  ON public.canonical_sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) canonical_revenue (paid-only view, single source of truth) --
CREATE OR REPLACE VIEW public.canonical_revenue
WITH (security_invoker = on) AS
SELECT
  o.id                       AS order_id,
  o.stripe_session_id,
  o.stripe_payment_intent_id,
  o.ga_client_id,
  o.total_amount,
  o.currency,
  o.created_at               AS paid_at,
  o.items
FROM public.orders o
WHERE o.status = 'paid'
  AND o.stripe_session_id IS NOT NULL;

GRANT SELECT ON public.canonical_revenue TO authenticated;
GRANT SELECT ON public.canonical_revenue TO service_role;

-- 5) Materialized views ------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_canonical_funnel_hourly;
CREATE MATERIALIZED VIEW public.mv_canonical_funnel_hourly AS
SELECT
  date_trunc('hour', occurred_at) AS bucket,
  canonical_name,
  COUNT(*)                         AS event_count,
  COUNT(DISTINCT session_id)       AS unique_sessions,
  COUNT(DISTINCT visitor_id)       AS unique_visitors
FROM public.canonical_events
WHERE occurred_at >= now() - interval '60 days'
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS mv_canonical_funnel_hourly_uniq
  ON public.mv_canonical_funnel_hourly (bucket, canonical_name);

GRANT SELECT ON public.mv_canonical_funnel_hourly TO authenticated;
GRANT SELECT ON public.mv_canonical_funnel_hourly TO service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_canonical_product_performance_daily;
CREATE MATERIALIZED VIEW public.mv_canonical_product_performance_daily AS
SELECT
  date_trunc('day', occurred_at)::date           AS day,
  product_id,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS views,
  COUNT(DISTINCT session_id) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS unique_views,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')  AS atc,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT')     AS checkout,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')     AS purchases,
  COALESCE(SUM(value_cents) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE'), 0)::bigint AS revenue_cents
FROM public.canonical_events
WHERE occurred_at >= now() - interval '90 days'
  AND product_id IS NOT NULL
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS mv_canonical_product_perf_daily_uniq
  ON public.mv_canonical_product_performance_daily (day, product_id);

GRANT SELECT ON public.mv_canonical_product_performance_daily TO authenticated;
GRANT SELECT ON public.mv_canonical_product_performance_daily TO service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_canonical_traffic_source_daily;
CREATE MATERIALIZED VIEW public.mv_canonical_traffic_source_daily AS
SELECT
  date_trunc('day', occurred_at)::date AS day,
  COALESCE(utm_source, 'direct')        AS source,
  COALESCE(utm_medium, 'none')          AS medium,
  COUNT(DISTINCT session_id)            AS sessions,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS product_views,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')  AS atc,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT')     AS checkout,
  COUNT(*) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')     AS purchases,
  COALESCE(SUM(value_cents) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE'), 0)::bigint AS revenue_cents
FROM public.canonical_events
WHERE occurred_at >= now() - interval '90 days'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS mv_canonical_traffic_source_daily_uniq
  ON public.mv_canonical_traffic_source_daily (day, source, medium);

GRANT SELECT ON public.mv_canonical_traffic_source_daily TO authenticated;
GRANT SELECT ON public.mv_canonical_traffic_source_daily TO service_role;

-- 6) Refresh helper ----------------------------------------------
CREATE OR REPLACE FUNCTION public.canonical_refresh_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_canonical_funnel_hourly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_canonical_product_performance_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_canonical_traffic_source_daily;
END $$;

REVOKE ALL ON FUNCTION public.canonical_refresh_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_refresh_all() TO service_role;
