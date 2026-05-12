
-- ─────────────────────────────────────────────────────────────
-- Growth Intelligence Engine — Phase 1
-- ─────────────────────────────────────────────────────────────

-- Helper: admin check (reuses existing has_role)
-- Assumes public.has_role(uuid, app_role) and 'admin' role already exist.

-- 1. SETTINGS (singleton)
CREATE TABLE public.gi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  autopilot_mode text NOT NULL DEFAULT 'DRAFT_ONLY'
    CHECK (autopilot_mode IN ('OFF','OBSERVE_ONLY','DRAFT_ONLY','AUTO_QUEUE','AUTO_PUBLISH_CONSERVATIVE','AUTO_PUBLISH_BALANCED')),
  market text NOT NULL DEFAULT 'US',
  country_allowlist text[] NOT NULL DEFAULT ARRAY['US','United States'],
  pinterest_daily_cap int NOT NULL DEFAULT 4,
  tiktok_daily_cap int NOT NULL DEFAULT 3,
  min_us_sessions_for_decisions int NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.gi_settings (singleton) VALUES (true);

-- 2. UNIFIED TRAFFIC SESSIONS
CREATE TABLE public.gi_traffic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  visitor_id text,
  started_at timestamptz NOT NULL,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  pin_id text,
  video_id text,
  landing_page text,
  device text,
  browser text,
  country text,
  city text,
  region text,
  is_us boolean NOT NULL DEFAULT false,
  is_internal boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_traffic_sessions_uniq ON public.gi_traffic_sessions(session_id, started_at);
CREATE INDEX gi_traffic_sessions_country ON public.gi_traffic_sessions(country);
CREATE INDEX gi_traffic_sessions_started ON public.gi_traffic_sessions(started_at DESC);
CREATE INDEX gi_traffic_sessions_us ON public.gi_traffic_sessions(is_us) WHERE is_us = true;

-- 3. ATTRIBUTION EVENTS
CREATE TABLE public.gi_attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view','click','outbound_click','add_to_cart','checkout','purchase','engagement')),
  occurred_at timestamptz NOT NULL,
  product_id uuid,
  product_slug text,
  page_path text,
  revenue_cents int DEFAULT 0,
  quantity int,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gi_attribution_events_session ON public.gi_attribution_events(session_id);
CREATE INDEX gi_attribution_events_occurred ON public.gi_attribution_events(occurred_at DESC);
CREATE INDEX gi_attribution_events_type ON public.gi_attribution_events(event_type);

-- 4. SOCIAL CONTENT ITEMS
CREATE TABLE public.gi_social_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('pinterest_image','pinterest_video','tiktok','google_ads','google_organic','other')),
  external_id text,
  product_slug text,
  hook_family text,
  asset_url text,
  title text,
  description text,
  destination_url text,
  fingerprint text,
  published_at timestamptz,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_content_items_uniq ON public.gi_social_content_items(channel, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX gi_content_items_fingerprint ON public.gi_social_content_items(fingerprint);

-- 5. PER-CHANNEL DAILY METRICS
CREATE TABLE public.gi_pinterest_pin_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  date date NOT NULL,
  impressions int DEFAULT 0,
  saves int DEFAULT 0,
  outbound_clicks int DEFAULT 0,
  pin_clicks int DEFAULT 0,
  ctr numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_pin_metrics_uniq ON public.gi_pinterest_pin_metrics(pin_id, date);

CREATE TABLE public.gi_tiktok_video_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL,
  date date NOT NULL,
  views int DEFAULT 0,
  likes int DEFAULT 0,
  comments int DEFAULT 0,
  shares int DEFAULT 0,
  avg_watch_seconds numeric,
  completion_rate numeric,
  profile_clicks int DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_tt_metrics_uniq ON public.gi_tiktok_video_metrics(video_id, date);

CREATE TABLE public.gi_gsc_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  query text,
  page text,
  country text,
  impressions int DEFAULT 0,
  clicks int DEFAULT 0,
  ctr numeric,
  position numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_gsc_uniq ON public.gi_gsc_metrics(date, COALESCE(query,''), COALESCE(page,''), COALESCE(country,''));

CREATE TABLE public.gi_ga4_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  source text,
  medium text,
  campaign text,
  page_path text,
  country text,
  device text,
  event_name text,
  event_count int DEFAULT 0,
  sessions int DEFAULT 0,
  conversions int DEFAULT 0,
  revenue_cents int DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gi_ga4_date ON public.gi_ga4_events(date DESC);
CREATE INDEX gi_ga4_source ON public.gi_ga4_events(source, medium);

-- 6. ROLLUP TABLES
CREATE TABLE public.gi_product_performance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  product_id uuid,
  product_slug text,
  sessions_us int DEFAULT 0,
  views int DEFAULT 0,
  add_to_cart int DEFAULT 0,
  checkouts int DEFAULT 0,
  purchases int DEFAULT 0,
  revenue_cents int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_product_perf_uniq ON public.gi_product_performance_daily(date, COALESCE(product_slug, product_id::text));
CREATE INDEX gi_product_perf_date ON public.gi_product_performance_daily(date DESC);

CREATE TABLE public.gi_creative_performance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  content_item_id uuid REFERENCES public.gi_social_content_items(id) ON DELETE CASCADE,
  channel text,
  impressions int DEFAULT 0,
  clicks int DEFAULT 0,
  outbound_clicks int DEFAULT 0,
  saves int DEFAULT 0,
  sessions_us int DEFAULT 0,
  add_to_cart int DEFAULT 0,
  purchases int DEFAULT 0,
  revenue_cents int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_creative_perf_uniq ON public.gi_creative_performance_daily(date, content_item_id);

CREATE TABLE public.gi_channel_performance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  channel text NOT NULL,
  sessions_us int DEFAULT 0,
  sessions_excluded int DEFAULT 0,
  add_to_cart int DEFAULT 0,
  purchases int DEFAULT 0,
  revenue_cents int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gi_channel_perf_uniq ON public.gi_channel_performance_daily(date, channel);

-- 7. DECISIONS / ACTIONS / COMPLIANCE
CREATE TABLE public.gi_growth_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  target_kind text NOT NULL CHECK (target_kind IN ('product','content_item','channel','landing_page')),
  target_id text NOT NULL,
  decision_type text NOT NULL CHECK (decision_type IN ('SCALE','REMIX','PAUSE','RETRY_WITH_NEW_HOOK','CREATE_VIDEO_VERSION','CREATE_IMAGE_PIN_VERSION','SEND_TO_MANUAL_REVIEW','DO_NOT_PUBLISH_COMPLIANCE_RISK')),
  score numeric,
  confidence numeric,
  rationale text,
  signals jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','executed','rejected','expired'))
);
CREATE INDEX gi_decisions_target ON public.gi_growth_decisions(target_kind, target_id);
CREATE INDEX gi_decisions_status ON public.gi_growth_decisions(status, decided_at DESC);

CREATE TABLE public.gi_automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acted_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  target_kind text,
  target_id text,
  autopilot_mode text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','executed','failed','skipped')),
  result jsonb,
  error text
);
CREATE INDEX gi_actions_acted ON public.gi_automation_actions(acted_at DESC);

CREATE TABLE public.gi_compliance_review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  target_kind text NOT NULL,
  target_id text,
  outcome text NOT NULL CHECK (outcome IN ('pass','warn','block')),
  reasons text[],
  suggested_rewrite text,
  payload jsonb
);
CREATE INDEX gi_compliance_outcome ON public.gi_compliance_review_log(outcome, reviewed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- US-ONLY VIEWS (single source of truth for all decisions)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.us_traffic_sessions_v
WITH (security_invoker = true) AS
SELECT * FROM public.gi_traffic_sessions
WHERE is_us = true AND is_internal = false AND is_bot = false;

CREATE OR REPLACE VIEW public.us_attribution_events_v
WITH (security_invoker = true) AS
SELECT e.* FROM public.gi_attribution_events e
JOIN public.gi_traffic_sessions s ON s.session_id = e.session_id
WHERE s.is_us = true AND s.is_internal = false AND s.is_bot = false;

CREATE OR REPLACE VIEW public.us_product_performance_daily_v
WITH (security_invoker = true) AS
SELECT * FROM public.gi_product_performance_daily;

CREATE OR REPLACE VIEW public.us_creative_performance_daily_v
WITH (security_invoker = true) AS
SELECT * FROM public.gi_creative_performance_daily;

CREATE OR REPLACE VIEW public.us_channel_performance_daily_v
WITH (security_invoker = true) AS
SELECT * FROM public.gi_channel_performance_daily;

-- ─────────────────────────────────────────────────────────────
-- RLS — admin-only on every gi_* table
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'gi\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_%s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "admin_all_%s" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role));',
      t, t
    );
  END LOOP;
END $$;

-- updated_at trigger reuse
CREATE TRIGGER gi_settings_set_updated_at
BEFORE UPDATE ON public.gi_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER gi_content_items_set_updated_at
BEFORE UPDATE ON public.gi_social_content_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
