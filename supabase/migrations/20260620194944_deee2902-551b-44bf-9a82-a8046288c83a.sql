
CREATE TABLE IF NOT EXISTS public.revenue_ai_pin_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  product_id text,
  voice_id text,
  category text,
  hook_archetype text,
  cta_archetype text,
  video_duration_bucket text,
  opening_scene_archetype text,
  camera_archetype text,
  impressions int NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  atc int NOT NULL DEFAULT 0,
  checkouts int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  outbound_ctr numeric(8,5) NOT NULL DEFAULT 0,
  atc_rate numeric(8,5) NOT NULL DEFAULT 0,
  checkout_rate numeric(8,5) NOT NULL DEFAULT 0,
  purchase_rate numeric(8,5) NOT NULL DEFAULT 0,
  revenue_per_impression numeric(12,6) NOT NULL DEFAULT 0,
  revenue_per_click numeric(12,6) NOT NULL DEFAULT 0,
  percentile_revenue numeric(6,3) NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'untested',
  day date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, day)
);
CREATE INDEX IF NOT EXISTS idx_rai_perf_day_tier ON public.revenue_ai_pin_performance (day DESC, tier);
CREATE INDEX IF NOT EXISTS idx_rai_perf_category ON public.revenue_ai_pin_performance (category, day DESC);
CREATE INDEX IF NOT EXISTS idx_rai_perf_product ON public.revenue_ai_pin_performance (product_id, day DESC);
GRANT SELECT ON public.revenue_ai_pin_performance TO authenticated;
GRANT ALL ON public.revenue_ai_pin_performance TO service_role;
ALTER TABLE public.revenue_ai_pin_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_perf_admin_read" ON public.revenue_ai_pin_performance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_winner_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  key text NOT NULL,
  n_pins int NOT NULL DEFAULT 0,
  avg_revenue_per_click numeric(12,6) NOT NULL DEFAULT 0,
  avg_purchase_rate numeric(8,5) NOT NULL DEFAULT 0,
  score numeric(10,4) NOT NULL DEFAULT 0,
  ewma numeric(10,4) NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dimension, key)
);
GRANT SELECT ON public.revenue_ai_winner_dna TO authenticated;
GRANT ALL ON public.revenue_ai_winner_dna TO service_role;
ALTER TABLE public.revenue_ai_winner_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_dna_admin_read" ON public.revenue_ai_winner_dna FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_loser_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  key text NOT NULL,
  reason text,
  evidence_pins text[] NOT NULL DEFAULT '{}',
  blocked_until timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  severity text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_rai_loser_until ON public.revenue_ai_loser_blocklist (blocked_until);
GRANT SELECT ON public.revenue_ai_loser_blocklist TO authenticated;
GRANT ALL ON public.revenue_ai_loser_blocklist TO service_role;
ALTER TABLE public.revenue_ai_loser_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_loser_admin_read" ON public.revenue_ai_loser_blocklist FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_voice_rankings (
  voice_id text PRIMARY KEY,
  n_pins int NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  revenue_per_click numeric(12,6) NOT NULL DEFAULT 0,
  conversion_rate numeric(8,5) NOT NULL DEFAULT 0,
  ranking int NOT NULL DEFAULT 0,
  allocation_weight numeric(5,3) NOT NULL DEFAULT 1.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.revenue_ai_voice_rankings TO authenticated;
GRANT ALL ON public.revenue_ai_voice_rankings TO service_role;
ALTER TABLE public.revenue_ai_voice_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_voice_admin_read" ON public.revenue_ai_voice_rankings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_category_profiles (
  category text PRIMARY KEY,
  winning_hook_archetypes text[] NOT NULL DEFAULT '{}',
  winning_cta text[] NOT NULL DEFAULT '{}',
  winning_duration_bucket text,
  winning_voice_ids text[] NOT NULL DEFAULT '{}',
  winning_camera text,
  avg_revenue_per_click numeric(12,6) NOT NULL DEFAULT 0,
  sample_size int NOT NULL DEFAULT 0,
  last_refreshed timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.revenue_ai_category_profiles TO authenticated;
GRANT ALL ON public.revenue_ai_category_profiles TO service_role;
ALTER TABLE public.revenue_ai_category_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_cat_admin_read" ON public.revenue_ai_category_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_trend_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  trend_score numeric(8,4) NOT NULL DEFAULT 0,
  pct_change_7d numeric(8,4) NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'stable',
  recommended_quota_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, category)
);
GRANT SELECT ON public.revenue_ai_trend_signals TO authenticated;
GRANT ALL ON public.revenue_ai_trend_signals TO service_role;
ALTER TABLE public.revenue_ai_trend_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_trend_admin_read" ON public.revenue_ai_trend_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_revenue_scores (
  product_id text PRIMARY KEY,
  stock_score numeric(6,2) NOT NULL DEFAULT 0,
  ctr_score numeric(6,2) NOT NULL DEFAULT 0,
  sales_score numeric(6,2) NOT NULL DEFAULT 0,
  media_score numeric(6,2) NOT NULL DEFAULT 0,
  pinterest_score numeric(6,2) NOT NULL DEFAULT 0,
  composite numeric(6,2) NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'contender',
  publish_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rai_scores_composite ON public.revenue_ai_revenue_scores (composite DESC);
GRANT SELECT ON public.revenue_ai_revenue_scores TO authenticated;
GRANT ALL ON public.revenue_ai_revenue_scores TO service_role;
ALTER TABLE public.revenue_ai_revenue_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_scores_admin_read" ON public.revenue_ai_revenue_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_executive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL DEFAULT CURRENT_DATE,
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  worst_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  rising_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  falling_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  promote_more jsonb NOT NULL DEFAULT '[]'::jsonb,
  promote_less jsonb NOT NULL DEFAULT '[]'::jsonb,
  headline_text text,
  full_markdown text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day)
);
GRANT SELECT ON public.revenue_ai_executive_reports TO authenticated;
GRANT ALL ON public.revenue_ai_executive_reports TO service_role;
ALTER TABLE public.revenue_ai_executive_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_exec_admin_read" ON public.revenue_ai_executive_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.revenue_ai_settings (
  id boolean PRIMARY KEY DEFAULT true,
  top1_pct numeric(4,3) NOT NULL DEFAULT 0.01,
  top5_pct numeric(4,3) NOT NULL DEFAULT 0.05,
  top10_pct numeric(4,3) NOT NULL DEFAULT 0.10,
  loser_min_impressions int NOT NULL DEFAULT 2000,
  loser_ctr_floor_ratio numeric(4,2) NOT NULL DEFAULT 0.6,
  voice_min_pins int NOT NULL DEFAULT 10,
  winner_clone_max_per_day int NOT NULL DEFAULT 30,
  loser_block_days int NOT NULL DEFAULT 14,
  queue_min_video_jobs int NOT NULL DEFAULT 100,
  queue_min_pins int NOT NULL DEFAULT 50,
  queue_min_reserve int NOT NULL DEFAULT 20,
  executive_hour_utc int NOT NULL DEFAULT 5,
  revenue_weight_split jsonb NOT NULL DEFAULT '{"click":1,"atc":3,"checkout":6,"purchase":12}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rai_settings_singleton CHECK (id = true)
);
GRANT SELECT ON public.revenue_ai_settings TO authenticated;
GRANT ALL ON public.revenue_ai_settings TO service_role;
ALTER TABLE public.revenue_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rai_settings_admin_read" ON public.revenue_ai_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.revenue_ai_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
