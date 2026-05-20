
-- Growth Intelligence Phase 1

CREATE TABLE IF NOT EXISTS public.growth_market_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  source TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'US',
  category TEXT,
  score NUMERIC NOT NULL DEFAULT 0,
  momentum NUMERIC NOT NULL DEFAULT 0,
  season TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gmt_term ON public.growth_market_trends(term);
CREATE INDEX IF NOT EXISTS idx_gmt_market_score ON public.growth_market_trends(market, score DESC);

CREATE TABLE IF NOT EXISTS public.growth_keyword_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  volume INTEGER,
  intent TEXT,
  fit_category TEXT,
  score NUMERIC NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gko_score ON public.growth_keyword_opportunities(score DESC);

CREATE TABLE IF NOT EXISTS public.growth_viral_hook_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hook TEXT NOT NULL,
  family TEXT,
  structure TEXT,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_competitor_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT,
  pattern_type TEXT NOT NULL,
  summary TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_seasonal_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  theme TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  lift_score NUMERIC NOT NULL DEFAULT 0,
  active_from DATE,
  active_to DATE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_product_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  opportunity_score NUMERIC NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_channel TEXT,
  recommended_angle TEXT,
  recommended_hook TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, day)
);
CREATE INDEX IF NOT EXISTS idx_gps_day_score ON public.growth_product_scores(day DESC, opportunity_score DESC);

CREATE TABLE IF NOT EXISTS public.growth_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  decision_type TEXT NOT NULL,
  product_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gd_day_type ON public.growth_decisions(day DESC, decision_type);
CREATE INDEX IF NOT EXISTS idx_gd_product ON public.growth_decisions(product_id);

CREATE TABLE IF NOT EXISTS public.growth_autopilot_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  paused_publishing BOOLEAN NOT NULL DEFAULT false,
  max_pins_per_day INTEGER NOT NULL DEFAULT 4,
  min_product_score NUMERIC NOT NULL DEFAULT 55,
  category_whitelist TEXT[] NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'manual',
  emergency_stop BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.growth_autopilot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.growth_strategy_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dimension, key)
);

CREATE TABLE IF NOT EXISTS public.growth_weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  trace_id TEXT,
  product_id UUID,
  decision_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ge_created ON public.growth_events(created_at DESC);

-- RLS: admin-only
ALTER TABLE public.growth_market_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_keyword_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_viral_hook_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_competitor_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_seasonal_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_product_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_autopilot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_strategy_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'growth_market_trends','growth_keyword_opportunities','growth_viral_hook_patterns',
    'growth_competitor_insights','growth_seasonal_opportunities','growth_product_scores',
    'growth_decisions','growth_autopilot_config','growth_strategy_scores',
    'growth_weekly_reports','growth_events'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin all" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "admin all" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role))$p$, t);
  END LOOP;
END $$;
