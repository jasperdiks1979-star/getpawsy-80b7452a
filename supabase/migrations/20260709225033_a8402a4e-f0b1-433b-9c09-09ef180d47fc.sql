
-- ============================================================
-- GEIP: Google Enterprise Intelligence Platform (Layer-0)
-- ============================================================

-- 1. Connections & Properties
CREATE TABLE public.geip_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL UNIQUE, -- gsc, ga4, merchant, pagespeed, crux, indexing, business_profile, url_inspection, site_verification
  status text NOT NULL DEFAULT 'waiting_for_auth', -- ready, waiting_for_auth, error, disabled
  blocker text, -- machine code: missing_secret, missing_connector, scope_error, provider_error
  last_ok_at timestamptz,
  last_check_at timestamptz,
  scopes jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.geip_connections TO authenticated;
GRANT ALL ON public.geip_connections TO service_role;
ALTER TABLE public.geip_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_connections" ON public.geip_connections FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL, -- gsc | ga4 | merchant
  property_id text NOT NULL, -- sc-domain:getpawsy.pet | 123456789 | merchant account id
  display_name text,
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(surface, property_id)
);
GRANT SELECT ON public.geip_properties TO authenticated;
GRANT ALL ON public.geip_properties TO service_role;
ALTER TABLE public.geip_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_properties" ON public.geip_properties FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 2. Sync runs (telemetry)
CREATE TABLE public.geip_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- gsc, ga4, merchant, pagespeed, crux, url_inspection, technical_seo, ai_search, health_score, alerts
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- running, ok, waiting_for_auth, error, partial
  blocker text,
  rows_ingested int DEFAULT 0,
  error text,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_geip_sync_runs_source_started ON public.geip_sync_runs(source, started_at DESC);
GRANT SELECT ON public.geip_sync_runs TO authenticated;
GRANT ALL ON public.geip_sync_runs TO service_role;
ALTER TABLE public.geip_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_sync_runs" ON public.geip_sync_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 3. Search Console
CREATE TABLE public.geip_gsc_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  date date NOT NULL,
  dimension text NOT NULL, -- total, query, page, country, device, search_appearance
  dimension_value text NOT NULL DEFAULT '',
  clicks int NOT NULL DEFAULT 0,
  impressions int NOT NULL DEFAULT 0,
  ctr numeric(6,4) NOT NULL DEFAULT 0,
  position numeric(6,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, date, dimension, dimension_value)
);
CREATE INDEX idx_geip_gsc_daily_date ON public.geip_gsc_daily(date DESC);
CREATE INDEX idx_geip_gsc_daily_dim ON public.geip_gsc_daily(dimension, date DESC);
GRANT SELECT ON public.geip_gsc_daily TO authenticated;
GRANT ALL ON public.geip_gsc_daily TO service_role;
ALTER TABLE public.geip_gsc_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_gsc_daily" ON public.geip_gsc_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_gsc_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  bucket text NOT NULL, -- indexed, excluded, discovered, crawled_not_indexed, canonical_conflict, soft_404, blocked_robots, noindex
  url_count int NOT NULL DEFAULT 0,
  sample_urls jsonb DEFAULT '[]'::jsonb
);
CREATE INDEX idx_geip_gsc_coverage_captured ON public.geip_gsc_coverage(captured_at DESC);
GRANT SELECT ON public.geip_gsc_coverage TO authenticated;
GRANT ALL ON public.geip_gsc_coverage TO service_role;
ALTER TABLE public.geip_gsc_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_gsc_coverage" ON public.geip_gsc_coverage FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_url_inspection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  url text NOT NULL,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  verdict text,
  coverage_state text,
  indexing_state text,
  mobile_usable text,
  rich_results_state text,
  last_crawl_time timestamptz,
  robots_txt_state text,
  canonical_url text,
  raw jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_geip_url_insp_url ON public.geip_url_inspection(url, inspected_at DESC);
GRANT SELECT ON public.geip_url_inspection TO authenticated;
GRANT ALL ON public.geip_url_inspection TO service_role;
ALTER TABLE public.geip_url_inspection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_url_inspection" ON public.geip_url_inspection FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_sitemaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  path text NOT NULL,
  last_submitted timestamptz,
  last_downloaded timestamptz,
  is_pending boolean DEFAULT false,
  errors int DEFAULT 0,
  warnings int DEFAULT 0,
  contents jsonb DEFAULT '[]'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, path)
);
GRANT SELECT ON public.geip_sitemaps TO authenticated;
GRANT ALL ON public.geip_sitemaps TO service_role;
ALTER TABLE public.geip_sitemaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_sitemaps" ON public.geip_sitemaps FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_manual_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  action_type text,
  affected text,
  message text,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.geip_manual_actions TO authenticated;
GRANT ALL ON public.geip_manual_actions TO service_role;
ALTER TABLE public.geip_manual_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_manual_actions" ON public.geip_manual_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_security_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  issue_type text,
  severity text,
  message text,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.geip_security_issues TO authenticated;
GRANT ALL ON public.geip_security_issues TO service_role;
ALTER TABLE public.geip_security_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_security_issues" ON public.geip_security_issues FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 4. GA4
CREATE TABLE public.geip_ga4_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  date date NOT NULL,
  channel_group text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  landing_page text NOT NULL DEFAULT '',
  sessions int NOT NULL DEFAULT 0,
  users int NOT NULL DEFAULT 0,
  engaged_sessions int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, date, channel_group, source, medium, landing_page)
);
CREATE INDEX idx_geip_ga4_date ON public.geip_ga4_daily(date DESC);
GRANT SELECT ON public.geip_ga4_daily TO authenticated;
GRANT ALL ON public.geip_ga4_daily TO service_role;
ALTER TABLE public.geip_ga4_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_ga4_daily" ON public.geip_ga4_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 5. Merchant Center
CREATE TABLE public.geip_merchant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL,
  product_id text NOT NULL,
  title text,
  status text, -- approved, disapproved, pending, expiring
  destination text, -- shopping_ads, free_listings, etc
  disapproval_reasons jsonb DEFAULT '[]'::jsonb,
  warnings jsonb DEFAULT '[]'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb DEFAULT '{}'::jsonb,
  UNIQUE(merchant_id, product_id, destination)
);
CREATE INDEX idx_geip_merchant_status ON public.geip_merchant_products(status);
GRANT SELECT ON public.geip_merchant_products TO authenticated;
GRANT ALL ON public.geip_merchant_products TO service_role;
ALTER TABLE public.geip_merchant_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_merchant_products" ON public.geip_merchant_products FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_merchant_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  issue_code text,
  severity text,
  affected_products int DEFAULT 0,
  description text,
  documentation text,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.geip_merchant_issues TO authenticated;
GRANT ALL ON public.geip_merchant_issues TO service_role;
ALTER TABLE public.geip_merchant_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_merchant_issues" ON public.geip_merchant_issues FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 6. PageSpeed / CrUX
CREATE TABLE public.geip_pagespeed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  strategy text NOT NULL, -- mobile | desktop
  captured_at timestamptz NOT NULL DEFAULT now(),
  performance numeric(5,2),
  accessibility numeric(5,2),
  best_practices numeric(5,2),
  seo numeric(5,2),
  lcp_ms int,
  cls numeric(6,3),
  inp_ms int,
  ttfb_ms int,
  fcp_ms int,
  raw jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_geip_pagespeed_url_captured ON public.geip_pagespeed_runs(url, captured_at DESC);
GRANT SELECT ON public.geip_pagespeed_runs TO authenticated;
GRANT ALL ON public.geip_pagespeed_runs TO service_role;
ALTER TABLE public.geip_pagespeed_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_pagespeed_runs" ON public.geip_pagespeed_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.geip_crux_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL, -- origin | url
  identifier text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  form_factor text NOT NULL DEFAULT 'ALL_FORM_FACTORS',
  lcp_p75_ms int,
  cls_p75 numeric(6,3),
  inp_p75_ms int,
  ttfb_p75_ms int,
  fcp_p75_ms int,
  raw jsonb DEFAULT '{}'::jsonb,
  UNIQUE(scope, identifier, date, form_factor)
);
GRANT SELECT ON public.geip_crux_daily TO authenticated;
GRANT ALL ON public.geip_crux_daily TO service_role;
ALTER TABLE public.geip_crux_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_crux_daily" ON public.geip_crux_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 7. Technical SEO
CREATE TABLE public.geip_technical_seo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  has_title boolean, title_len int,
  has_description boolean, description_len int,
  has_canonical boolean, canonical_target text,
  has_og boolean, has_twitter boolean, has_hreflang boolean,
  schema_types jsonb DEFAULT '[]'::jsonb,
  status_code int,
  is_noindex boolean, is_disallowed boolean,
  internal_links int, broken_links int,
  raw jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_geip_tech_seo_url_captured ON public.geip_technical_seo(url, captured_at DESC);
GRANT SELECT ON public.geip_technical_seo TO authenticated;
GRANT ALL ON public.geip_technical_seo TO service_role;
ALTER TABLE public.geip_technical_seo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_technical_seo" ON public.geip_technical_seo FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 8. AI Search signals
CREATE TABLE public.geip_ai_search_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  has_faq boolean, has_howto boolean, has_product boolean, has_review boolean,
  has_breadcrumb boolean, has_article boolean,
  entity_coverage_score numeric(5,2),
  ai_overview_ready boolean,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.geip_ai_search_signals TO authenticated;
GRANT ALL ON public.geip_ai_search_signals TO service_role;
ALTER TABLE public.geip_ai_search_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_ai_search_signals" ON public.geip_ai_search_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 9. Health scores
CREATE TABLE public.geip_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  overall numeric(5,2) NOT NULL DEFAULT 0,
  search_console numeric(5,2), merchant numeric(5,2), seo numeric(5,2),
  index_score numeric(5,2), schema_score numeric(5,2), pagespeed numeric(5,2),
  ai_search numeric(5,2), eeat numeric(5,2), trust numeric(5,2),
  organic_growth numeric(5,2),
  why jsonb DEFAULT '{}'::jsonb -- explanations per sub-score
);
CREATE INDEX idx_geip_health_captured ON public.geip_health_scores(captured_at DESC);
GRANT SELECT ON public.geip_health_scores TO authenticated;
GRANT ALL ON public.geip_health_scores TO service_role;
ALTER TABLE public.geip_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_health_scores" ON public.geip_health_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 10. Alerts
CREATE TABLE public.geip_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, -- gsc, merchant, pagespeed, coverage, security, ga4
  severity text NOT NULL, -- info, warning, critical
  code text NOT NULL,
  title text NOT NULL,
  detail text,
  evidence jsonb DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
CREATE INDEX idx_geip_alerts_created ON public.geip_alerts(created_at DESC);
GRANT SELECT ON public.geip_alerts TO authenticated;
GRANT ALL ON public.geip_alerts TO service_role;
ALTER TABLE public.geip_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_alerts" ON public.geip_alerts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 11. Opportunities (Organic Growth Engine output)
CREATE TABLE public.geip_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL, -- keyword_gap, product_opportunity, content_gap, internal_link, topical_gap
  target_url text,
  target_query text,
  expected_traffic_lift int,
  expected_revenue_cents bigint,
  confidence numeric(4,2) NOT NULL DEFAULT 0,
  evidence jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_geip_opps_active ON public.geip_opportunities(is_active, confidence DESC);
GRANT SELECT ON public.geip_opportunities TO authenticated;
GRANT ALL ON public.geip_opportunities TO service_role;
ALTER TABLE public.geip_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_opportunities" ON public.geip_opportunities FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 12. Copilot answers (cache + audit)
CREATE TABLE public.geip_copilot_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL,
  evidence_refs jsonb DEFAULT '[]'::jsonb,
  model text,
  tokens_in int, tokens_out int,
  is_dormant boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_geip_copilot_created ON public.geip_copilot_answers(created_at DESC);
GRANT SELECT ON public.geip_copilot_answers TO authenticated;
GRANT ALL ON public.geip_copilot_answers TO service_role;
ALTER TABLE public.geip_copilot_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read geip_copilot_answers" ON public.geip_copilot_answers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Readiness helper (dormant → active gate for AI modules)
CREATE OR REPLACE FUNCTION public.geip_readiness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gsc_days int; ga4_days int; url_insp int; pagespeed_runs int;
BEGIN
  SELECT COUNT(DISTINCT date) INTO gsc_days FROM public.geip_gsc_daily WHERE date >= CURRENT_DATE - INTERVAL '30 days';
  SELECT COUNT(DISTINCT date) INTO ga4_days FROM public.geip_ga4_daily WHERE date >= CURRENT_DATE - INTERVAL '30 days';
  SELECT COUNT(*) INTO url_insp FROM public.geip_url_inspection WHERE inspected_at >= now() - INTERVAL '30 days';
  SELECT COUNT(*) INTO pagespeed_runs FROM public.geip_pagespeed_runs WHERE captured_at >= now() - INTERVAL '30 days';
  RETURN jsonb_build_object(
    'gsc_days', gsc_days, 'gsc_target', 14,
    'ga4_days', ga4_days, 'ga4_target', 14,
    'url_inspections', url_insp, 'url_inspections_target', 50,
    'pagespeed_runs', pagespeed_runs, 'pagespeed_runs_target', 25,
    'organic_growth_ready', (gsc_days >= 14 AND ga4_days >= 14),
    'copilot_ready', (gsc_days >= 14 AND ga4_days >= 14 AND url_insp >= 50)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.geip_readiness() TO authenticated, service_role;

-- Seed connection rows
INSERT INTO public.geip_connections(surface, status, blocker) VALUES
  ('gsc','waiting_for_auth','missing_connector'),
  ('ga4','waiting_for_auth','check_secret'),
  ('merchant','waiting_for_auth','check_oauth'),
  ('pagespeed','waiting_for_auth','missing_secret'),
  ('crux','waiting_for_auth','missing_secret'),
  ('url_inspection','waiting_for_auth','missing_connector'),
  ('site_verification','waiting_for_auth','missing_connector'),
  ('indexing','disabled','write_disabled_by_default'),
  ('business_profile','waiting_for_auth','future_ready')
ON CONFLICT (surface) DO NOTHING;

INSERT INTO public.geip_properties(surface, property_id, display_name, is_default) VALUES
  ('gsc','sc-domain:getpawsy.pet','getpawsy.pet',true)
ON CONFLICT (surface, property_id) DO NOTHING;
