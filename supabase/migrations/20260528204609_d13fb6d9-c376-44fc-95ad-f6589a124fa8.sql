
-- =========================================================
-- CI-8: AI Homepage Personalization (additive, rollback-safe)
-- =========================================================

-- 1. Variants
CREATE TABLE IF NOT EXISTS public.ai_homepage_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_key TEXT NOT NULL UNIQUE,
  traffic_source TEXT,
  geo_tier TEXT,
  device_quality TEXT,
  hero_category TEXT,
  hero_product_id UUID,
  emotional_angle TEXT,
  headline TEXT,
  subheadline TEXT,
  primary_cta TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  atc BIGINT NOT NULL DEFAULT 0,
  purchases BIGINT NOT NULL DEFAULT 0,
  bounce_delta NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_homepage_variants TO authenticated;
GRANT ALL ON public.ai_homepage_variants TO service_role;

ALTER TABLE public.ai_homepage_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage homepage variants"
  ON public.ai_homepage_variants
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_homepage_variants_segment_idx
  ON public.ai_homepage_variants (traffic_source, geo_tier, device_quality)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS ai_homepage_variants_perf_idx
  ON public.ai_homepage_variants (performance_score DESC)
  WHERE active = true;

CREATE TRIGGER ai_homepage_variants_set_updated_at
  BEFORE UPDATE ON public.ai_homepage_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- 2. Events
CREATE TABLE IF NOT EXISTS public.homepage_variant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  variant_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'impression','hero_click','pdp_view','atc','purchase','bounce'
  )),
  product_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only for writes; admins can read. No anon, no authenticated write policy.
GRANT SELECT ON public.homepage_variant_events TO authenticated;
GRANT ALL ON public.homepage_variant_events TO service_role;

ALTER TABLE public.homepage_variant_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read homepage variant events"
  ON public.homepage_variant_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS homepage_variant_events_recent_idx
  ON public.homepage_variant_events (created_at DESC);

CREATE INDEX IF NOT EXISTS homepage_variant_events_variant_idx
  ON public.homepage_variant_events (variant_key, event_type, created_at DESC);


-- 3. Aggregate view for admin dashboard
CREATE OR REPLACE VIEW public.ai_homepage_variant_stats AS
SELECT
  v.variant_key,
  v.traffic_source,
  v.geo_tier,
  v.device_quality,
  v.emotional_angle,
  v.headline,
  v.active,
  v.performance_score,
  COALESCE(SUM(CASE WHEN e.event_type = 'impression' THEN 1 ELSE 0 END), 0) AS impressions_24h,
  COALESCE(SUM(CASE WHEN e.event_type = 'hero_click' THEN 1 ELSE 0 END), 0) AS hero_clicks_24h,
  COALESCE(SUM(CASE WHEN e.event_type = 'pdp_view'   THEN 1 ELSE 0 END), 0) AS pdp_views_24h,
  COALESCE(SUM(CASE WHEN e.event_type = 'atc'        THEN 1 ELSE 0 END), 0) AS atc_24h,
  COALESCE(SUM(CASE WHEN e.event_type = 'purchase'   THEN 1 ELSE 0 END), 0) AS purchases_24h,
  COALESCE(SUM(CASE WHEN e.event_type = 'bounce'     THEN 1 ELSE 0 END), 0) AS bounces_24h
FROM public.ai_homepage_variants v
LEFT JOIN public.homepage_variant_events e
  ON e.variant_key = v.variant_key
 AND e.created_at > (now() - interval '24 hours')
GROUP BY v.variant_key, v.traffic_source, v.geo_tier, v.device_quality,
         v.emotional_angle, v.headline, v.active, v.performance_score;

GRANT SELECT ON public.ai_homepage_variant_stats TO authenticated;
GRANT SELECT ON public.ai_homepage_variant_stats TO service_role;
