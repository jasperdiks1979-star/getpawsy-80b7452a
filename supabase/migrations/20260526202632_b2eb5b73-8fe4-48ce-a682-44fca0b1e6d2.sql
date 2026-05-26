
-- Phase 1: Pinterest AI Analytics foundation

-- Daily analytics snapshots per pin
CREATE TABLE IF NOT EXISTS public.pinterest_analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  day date NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  pin_clicks integer NOT NULL DEFAULT 0,
  video_views integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  quality_score numeric,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_analytics_daily TO authenticated;
GRANT ALL ON public.pinterest_analytics_daily TO service_role;
ALTER TABLE public.pinterest_analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read analytics" ON public.pinterest_analytics_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes analytics" ON public.pinterest_analytics_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pad_day ON public.pinterest_analytics_daily(day DESC);
CREATE INDEX IF NOT EXISTS idx_pad_pin ON public.pinterest_analytics_daily(pin_id);

-- Pin dimension lookup (denormalized for fast joins)
CREATE TABLE IF NOT EXISTS public.pinterest_pin_dimensions (
  pin_id text PRIMARY KEY,
  asset_id uuid,
  product_slug text,
  category_key text,
  hook_variant text,
  copy_variant text,
  cta_variant text,
  niche_key text,
  board_id text,
  source text,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_pin_dimensions TO authenticated;
GRANT ALL ON public.pinterest_pin_dimensions TO service_role;
ALTER TABLE public.pinterest_pin_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read dims" ON public.pinterest_pin_dimensions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes dims" ON public.pinterest_pin_dimensions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ppd_category ON public.pinterest_pin_dimensions(category_key);
CREATE INDEX IF NOT EXISTS idx_ppd_slug ON public.pinterest_pin_dimensions(product_slug);

-- Rolling benchmarks per category
CREATE TABLE IF NOT EXISTS public.pinterest_category_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL,
  window_days integer NOT NULL,
  avg_ctr numeric NOT NULL DEFAULT 0,
  avg_save_rate numeric NOT NULL DEFAULT 0,
  avg_engagement numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_key, window_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_category_benchmarks TO authenticated;
GRANT ALL ON public.pinterest_category_benchmarks TO service_role;
ALTER TABLE public.pinterest_category_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read benchmarks" ON public.pinterest_category_benchmarks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes benchmarks" ON public.pinterest_category_benchmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Pin verdicts (winner/loser/neutral) audit trail
CREATE TABLE IF NOT EXISTS public.pinterest_pin_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('winner','loser','neutral')),
  reason text,
  impressions integer,
  ctr numeric,
  saves integer,
  winner_score numeric,
  scored_at timestamptz NOT NULL DEFAULT now(),
  action_taken text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_pin_verdicts TO authenticated;
GRANT ALL ON public.pinterest_pin_verdicts TO service_role;
ALTER TABLE public.pinterest_pin_verdicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read verdicts" ON public.pinterest_pin_verdicts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes verdicts" ON public.pinterest_pin_verdicts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ppv_pin ON public.pinterest_pin_verdicts(pin_id, scored_at DESC);

-- Loser blocklist
CREATE TABLE IF NOT EXISTS public.pinterest_loser_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid,
  product_slug text,
  hook_variant text,
  reason text,
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_loser_blocklist TO authenticated;
GRANT ALL ON public.pinterest_loser_blocklist TO service_role;
ALTER TABLE public.pinterest_loser_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read blocklist" ON public.pinterest_loser_blocklist FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes blocklist" ON public.pinterest_loser_blocklist FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Extend video queue with priority/archived
ALTER TABLE public.pinterest_video_queue
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_score numeric;

-- Phase 3: Trend signals
CREATE TABLE IF NOT EXISTS public.pinterest_trend_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  source text NOT NULL,
  strength numeric NOT NULL DEFAULT 0,
  category_key text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_trend_signals TO authenticated;
GRANT ALL ON public.pinterest_trend_signals TO service_role;
ALTER TABLE public.pinterest_trend_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read trends" ON public.pinterest_trend_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes trends" ON public.pinterest_trend_signals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Competitor pins sample
CREATE TABLE IF NOT EXISTS public.pinterest_competitor_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_external_id text,
  source_account text,
  title text,
  description text,
  save_rate_est numeric,
  visual_hash text,
  pattern_tags text[],
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_competitor_pins TO authenticated;
GRANT ALL ON public.pinterest_competitor_pins TO service_role;
ALTER TABLE public.pinterest_competitor_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read competitors" ON public.pinterest_competitor_pins FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes competitors" ON public.pinterest_competitor_pins FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Posting windows
CREATE TABLE IF NOT EXISTS public.pinterest_posting_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL,
  timezone text NOT NULL,
  hour_of_day integer NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  score numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_key, timezone, hour_of_day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_posting_windows TO authenticated;
GRANT ALL ON public.pinterest_posting_windows TO service_role;
ALTER TABLE public.pinterest_posting_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read windows" ON public.pinterest_posting_windows FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes windows" ON public.pinterest_posting_windows FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Phase 4: governor + funnel events + domain health
CREATE TABLE IF NOT EXISTS public.pinterest_publish_governor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  max_pins_per_hour integer NOT NULL DEFAULT 4,
  max_per_board_per_day integer NOT NULL DEFAULT 8,
  cooldown_minutes_per_product integer NOT NULL DEFAULT 90,
  trust_score numeric NOT NULL DEFAULT 100,
  domain_healthy boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_publish_governor TO authenticated;
GRANT ALL ON public.pinterest_publish_governor TO service_role;
ALTER TABLE public.pinterest_publish_governor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read governor" ON public.pinterest_publish_governor FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write governor" ON public.pinterest_publish_governor FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes governor" ON public.pinterest_publish_governor FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.pinterest_publish_governor (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pinterest_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text,
  pin_id text,
  event_name text NOT NULL,
  product_slug text,
  value numeric,
  currency text DEFAULT 'USD',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_funnel_events TO authenticated;
GRANT INSERT ON public.pinterest_funnel_events TO anon;
GRANT ALL ON public.pinterest_funnel_events TO service_role;
ALTER TABLE public.pinterest_funnel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read funnel" ON public.pinterest_funnel_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Anon insert funnel" ON public.pinterest_funnel_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert funnel" ON public.pinterest_funnel_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service writes funnel" ON public.pinterest_funnel_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pfe_pin ON public.pinterest_funnel_events(pin_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pfe_session ON public.pinterest_funnel_events(session_key);

CREATE TABLE IF NOT EXISTS public.pinterest_domain_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  http_status integer,
  latency_ms integer,
  pinterest_reachable boolean,
  notes text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_domain_health TO authenticated;
GRANT ALL ON public.pinterest_domain_health TO service_role;
ALTER TABLE public.pinterest_domain_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read domain" ON public.pinterest_domain_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service writes domain" ON public.pinterest_domain_health FOR ALL TO service_role USING (true) WITH CHECK (true);
