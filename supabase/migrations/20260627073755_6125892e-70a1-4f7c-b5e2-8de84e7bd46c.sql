
-- =========================================================
-- ANALYTICS GOLD STANDARD — FOUNDATION
-- =========================================================

-- 1. ENGAGEMENT STARTS
CREATE TABLE public.analytics_engagement_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  visitor_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  ttclid text,
  fbclid text,
  gclid text,
  landing_page text,
  referrer text,
  device text,
  browser text,
  os text,
  country text,
  region text,
  city text,
  user_agent text,
  fired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aes_session ON public.analytics_engagement_starts(session_id);
CREATE INDEX idx_aes_fired_at ON public.analytics_engagement_starts(fired_at DESC);
CREATE UNIQUE INDEX uniq_aes_session ON public.analytics_engagement_starts(session_id);
GRANT ALL ON public.analytics_engagement_starts TO service_role;
GRANT SELECT ON public.analytics_engagement_starts TO authenticated;
ALTER TABLE public.analytics_engagement_starts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read engagement_starts" ON public.analytics_engagement_starts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. TRAFFIC CLASSIFICATION
CREATE TABLE public.analytics_traffic_classification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  traffic_type text NOT NULL CHECK (traffic_type IN ('human','prefetch','prerender','crawler','bot','internal','unknown')),
  reason text,
  user_agent text,
  sec_purpose text,
  purpose_header text,
  is_prerendering boolean DEFAULT false,
  was_hidden boolean DEFAULT false,
  ip_hash text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_atc_session ON public.analytics_traffic_classification(session_id);
CREATE INDEX idx_atc_type ON public.analytics_traffic_classification(traffic_type);
CREATE INDEX idx_atc_at ON public.analytics_traffic_classification(classified_at DESC);
GRANT ALL ON public.analytics_traffic_classification TO service_role;
GRANT SELECT ON public.analytics_traffic_classification TO authenticated;
ALTER TABLE public.analytics_traffic_classification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read traffic_classification" ON public.analytics_traffic_classification
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. FUNNEL WATERFALL
CREATE TABLE public.analytics_funnel_waterfall (
  session_id text PRIMARY KEY,
  visitor_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_page text,
  click_at timestamptz,
  redirect_at timestamptz,
  landing_at timestamptz,
  engagement_start_at timestamptz,
  page_view_at timestamptz,
  scroll_at timestamptz,
  view_item_at timestamptz,
  add_to_cart_at timestamptz,
  begin_checkout_at timestamptz,
  payment_at timestamptz,
  purchase_at timestamptz,
  furthest_step text,
  traffic_type text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_afw_updated ON public.analytics_funnel_waterfall(updated_at DESC);
CREATE INDEX idx_afw_furthest ON public.analytics_funnel_waterfall(furthest_step);
GRANT ALL ON public.analytics_funnel_waterfall TO service_role;
GRANT SELECT ON public.analytics_funnel_waterfall TO authenticated;
ALTER TABLE public.analytics_funnel_waterfall ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read funnel_waterfall" ON public.analytics_funnel_waterfall
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. SESSION QUALITY
CREATE TABLE public.analytics_session_quality (
  session_id text PRIMARY KEY,
  visitor_id text,
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  classification text CHECK (classification IN ('Bot','Accidental','Bounce','Interested','Shopping','HighIntent','Buyer')),
  time_on_page_ms integer DEFAULT 0,
  max_scroll_pct integer DEFAULT 0,
  mouse_events integer DEFAULT 0,
  touch_events integer DEFAULT 0,
  product_interactions integer DEFAULT 0,
  cart_interactions integer DEFAULT 0,
  checkout_interactions integer DEFAULT 0,
  visible_ratio numeric DEFAULT 0,
  page_count integer DEFAULT 1,
  return_visit boolean DEFAULT false,
  signals jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_asq_class ON public.analytics_session_quality(classification);
CREATE INDEX idx_asq_score ON public.analytics_session_quality(score DESC);
GRANT ALL ON public.analytics_session_quality TO service_role;
GRANT SELECT ON public.analytics_session_quality TO authenticated;
ALTER TABLE public.analytics_session_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read session_quality" ON public.analytics_session_quality
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. GEO QUALITY
CREATE TABLE public.analytics_geo_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  provider_used text,
  lookup_ms integer,
  fallback_level integer DEFAULT 0,
  confidence text CHECK (confidence IN ('High','Medium','Low','Unknown')),
  country text,
  region text,
  city text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_agq_session ON public.analytics_geo_quality(session_id);
CREATE INDEX idx_agq_conf ON public.analytics_geo_quality(confidence);
GRANT ALL ON public.analytics_geo_quality TO service_role;
GRANT SELECT ON public.analytics_geo_quality TO authenticated;
ALTER TABLE public.analytics_geo_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geo_quality" ON public.analytics_geo_quality
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. HEALTH CHECKS
CREATE TABLE public.analytics_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('green','yellow','red')),
  latency_ms integer,
  last_success_at timestamptz,
  failure_reason text,
  suggested_fix text,
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ahc_probe_time ON public.analytics_health_checks(probe_key, checked_at DESC);
GRANT ALL ON public.analytics_health_checks TO service_role;
GRANT SELECT ON public.analytics_health_checks TO authenticated;
ALTER TABLE public.analytics_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read health_checks" ON public.analytics_health_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. ALERTS
CREATE TABLE public.analytics_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  title text NOT NULL,
  message text,
  suggested_fix text,
  metric_value numeric,
  threshold_value numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  details jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_aa_status ON public.analytics_alerts(status, opened_at DESC);
CREATE INDEX idx_aa_key ON public.analytics_alerts(alert_key);
GRANT ALL ON public.analytics_alerts TO service_role;
GRANT SELECT ON public.analytics_alerts TO authenticated;
ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alerts" ON public.analytics_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. DAILY VALIDATION SNAPSHOT
CREATE TABLE public.analytics_daily_validation (
  report_date date PRIMARY KEY,
  server_sessions integer DEFAULT 0,
  engagement_starts integer DEFAULT 0,
  ga4_pageviews integer DEFAULT 0,
  visitor_activity_rows integer DEFAULT 0,
  purchases integer DEFAULT 0,
  geo_success_pct numeric DEFAULT 0,
  human_pct numeric DEFAULT 0,
  bot_pct numeric DEFAULT 0,
  prefetch_pct numeric DEFAULT 0,
  unknown_pct numeric DEFAULT 0,
  classification_breakdown jsonb DEFAULT '{}'::jsonb,
  report_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_daily_validation TO service_role;
GRANT SELECT ON public.analytics_daily_validation TO authenticated;
ALTER TABLE public.analytics_daily_validation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read daily_validation" ON public.analytics_daily_validation
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- DROP-OFF VIEW
CREATE OR REPLACE VIEW public.analytics_funnel_dropoff_v AS
SELECT
  count(*) FILTER (WHERE landing_at IS NOT NULL) AS landed,
  count(*) FILTER (WHERE engagement_start_at IS NOT NULL) AS engaged,
  count(*) FILTER (WHERE view_item_at IS NOT NULL) AS viewed_item,
  count(*) FILTER (WHERE add_to_cart_at IS NOT NULL) AS added_to_cart,
  count(*) FILTER (WHERE begin_checkout_at IS NOT NULL) AS began_checkout,
  count(*) FILTER (WHERE purchase_at IS NOT NULL) AS purchased,
  date_trunc('day', coalesce(landing_at, created_at)) AS day
FROM public.analytics_funnel_waterfall
GROUP BY date_trunc('day', coalesce(landing_at, created_at));
GRANT SELECT ON public.analytics_funnel_dropoff_v TO authenticated, service_role;
