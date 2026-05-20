
-- ============================================================
-- Phase 8a: Market Signal Engine — Foundation
-- ============================================================

-- 1. Signal sources registry
CREATE TABLE public.market_signal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL, -- 'marketplace' | 'social' | 'search' | 'internal'
  base_url text,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Raw signal snapshots
CREATE TABLE public.market_signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.market_signal_sources(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_snapshots_source_time ON public.market_signal_snapshots(source_id, captured_at DESC);

-- 3. Product market scores
CREATE TABLE public.market_product_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  market_score integer NOT NULL DEFAULT 0, -- 0-100
  priority text NOT NULL DEFAULT 'low', -- low | medium | high | explosive
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  trend_velocity numeric DEFAULT 0,
  competition_quality numeric DEFAULT 0,
  pinterest_potential numeric DEFAULT 0,
  tiktok_potential numeric DEFAULT 0,
  search_demand numeric DEFAULT 0,
  margin_score numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, day)
);
CREATE INDEX idx_market_scores_priority ON public.market_product_scores(day DESC, market_score DESC);

-- 4. Trending products
CREATE TABLE public.market_trending_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- 'amazon' | 'chewy' | 'pinterest' | 'tiktok' | ...
  external_id text,
  title text NOT NULL,
  category text,
  rank integer,
  velocity numeric DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_product_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_trending_source_time ON public.market_trending_products(source, captured_at DESC);

-- 5. Competitor insights
CREATE TABLE public.market_competitor_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor text NOT NULL,
  product_handle text NOT NULL,
  title text,
  price numeric,
  rating numeric,
  review_count integer,
  image_url text,
  insights jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competitor, product_handle)
);

-- 6. Creative patterns
CREATE TABLE public.market_creative_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL, -- 'hook' | 'background' | 'thumbnail' | 'caption' | 'cta'
  signature text NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  ewma_score numeric NOT NULL DEFAULT 0,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'observing', -- observing | promoted | retired
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pattern_type, signature)
);

-- 7. Growth predictions
CREATE TABLE public.market_growth_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  horizon text NOT NULL, -- '7d' | '30d' | 'seasonal'
  predicted_revenue numeric DEFAULT 0,
  predicted_traffic integer DEFAULT 0,
  predicted_conversions integer DEFAULT 0,
  confidence numeric DEFAULT 0,
  momentum numeric DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_predictions_product_horizon ON public.market_growth_predictions(product_id, horizon, computed_at DESC);

-- 8. Alerts
CREATE TABLE public.market_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info', -- info | warning | critical
  category text NOT NULL,
  title text NOT NULL,
  detail text,
  dedup_key text NOT NULL,
  status text NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
  cooldown_until timestamptz,
  occurrences integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dedup_key)
);
CREATE INDEX idx_market_alerts_status_severity ON public.market_alerts(status, severity, created_at DESC);

-- 9. Opportunity gaps
CREATE TABLE public.market_opportunity_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_type text NOT NULL, -- 'weak_creative' | 'weak_seo' | 'missing_video' | 'low_branding' | ...
  target text NOT NULL,
  competitor text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  opportunity_score integer NOT NULL DEFAULT 0,
  matched_product_id uuid,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_gaps_status ON public.market_opportunity_gaps(status, opportunity_score DESC);

-- 10. AI recommendations
CREATE TABLE public.market_ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL, -- 'product' | 'channel' | 'creative' | 'seo'
  target_id text,
  action text NOT NULL,
  reasoning text,
  confidence numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | applied
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_ai_recs_status ON public.market_ai_recommendations(status, created_at DESC);

-- 11. Signal logs
CREATE TABLE public.market_signal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.market_signal_sources(id) ON DELETE SET NULL,
  trace_id uuid,
  level text NOT NULL DEFAULT 'info', -- info | warn | error
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_logs_source_time ON public.market_signal_logs(source_id, created_at DESC);

-- 12. Signal failures
CREATE TABLE public.market_signal_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.market_signal_sources(id) ON DELETE SET NULL,
  error text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_failures_unresolved ON public.market_signal_failures(resolved, next_retry_at) WHERE resolved = false;

-- 13. Recovery events
CREATE TABLE public.market_signal_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.market_signal_sources(id) ON DELETE SET NULL,
  action text NOT NULL,
  result text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS — Admin-only via has_role
-- ============================================================
ALTER TABLE public.market_signal_sources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_signal_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_product_scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_trending_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_competitor_insights    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_creative_patterns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_growth_predictions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_alerts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_opportunity_gaps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_ai_recommendations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_signal_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_signal_failures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_signal_recovery_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'market_signal_sources','market_signal_snapshots','market_product_scores',
    'market_trending_products','market_competitor_insights','market_creative_patterns',
    'market_growth_predictions','market_alerts','market_opportunity_gaps',
    'market_ai_recommendations','market_signal_logs','market_signal_failures',
    'market_signal_recovery_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY "admins_all_%s" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
  END LOOP;
END $$;

-- Seed sources
INSERT INTO public.market_signal_sources (name, kind, base_url, enabled) VALUES
  ('amazon_us',       'marketplace', 'https://www.amazon.com',     true),
  ('chewy',           'marketplace', 'https://www.chewy.com',      true),
  ('petco',           'marketplace', 'https://www.petco.com',      true),
  ('petsmart',        'marketplace', 'https://www.petsmart.com',   true),
  ('walmart_pets',    'marketplace', 'https://www.walmart.com',    true),
  ('temu_us',         'marketplace', 'https://www.temu.com',       true),
  ('pinterest',       'social',      'https://www.pinterest.com',  true),
  ('tiktok',          'social',      'https://www.tiktok.com',     true),
  ('google_trends',   'search',      'https://trends.google.com',  true),
  ('google_shopping', 'search',      'https://shopping.google.com',true),
  ('internal',        'internal',    NULL,                          true)
ON CONFLICT (name) DO NOTHING;
