
-- ============== Market Intelligence Engine — Phase 1 ==============

-- TRENDS
CREATE TABLE public.mi_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_type text NOT NULL,
  term text NOT NULL,
  market text NOT NULL DEFAULT 'US',
  source text NOT NULL DEFAULT 'manual',
  score numeric NOT NULL DEFAULT 0,
  momentum numeric NOT NULL DEFAULT 0,
  season text,
  category text,
  notes text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mi_trends_market_score ON public.mi_trends(market, score DESC);
CREATE INDEX idx_mi_trends_type ON public.mi_trends(trend_type);

CREATE TABLE public.mi_trend_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id uuid REFERENCES public.mi_trends(id) ON DELETE CASCADE,
  source text NOT NULL,
  market text NOT NULL DEFAULT 'US',
  value numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mi_trend_signals_trend ON public.mi_trend_signals(trend_id, captured_at DESC);

-- COMPETITORS
CREATE TABLE public.mi_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mi_competitor_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES public.mi_competitors(id) ON DELETE CASCADE,
  url text NOT NULL,
  platform text,
  market text NOT NULL DEFAULT 'US',
  hook_type text,
  cta_type text,
  visual_style text,
  posting_cadence text,
  est_engagement numeric,
  product_category text,
  aesthetic_category text,
  structure text,
  thumbnail_pattern text,
  trust_signals text,
  lp_notes text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mi_obs_competitor ON public.mi_competitor_observations(competitor_id);
CREATE INDEX idx_mi_obs_observed ON public.mi_competitor_observations(observed_at DESC);

-- CREATIVE RECIPES
CREATE TABLE public.mi_creative_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hook_family text,
  first_3s_structure text,
  cta_timing text,
  overlay_style text,
  palette_category text,
  emotional_angle text,
  curiosity_pattern text,
  pain_framing text,
  benefit_framing text,
  social_proof_structure text,
  pacing text,
  scene_density text,
  product_positioning text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- REMIX DRAFTS
CREATE TABLE public.mi_remix_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES public.mi_creative_recipes(id) ON DELETE SET NULL,
  product_id uuid,
  generated_copy text,
  generated_brief text,
  status text NOT NULL DEFAULT 'draft',
  compliance_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mi_remix_status ON public.mi_remix_drafts(status);

-- OPPORTUNITIES
CREATE TABLE public.mi_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  market text NOT NULL DEFAULT 'US',
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mi_opp_score ON public.mi_opportunities(market, score DESC);

-- RECOMMENDATIONS
CREATE TABLE public.mi_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category text,
  market text NOT NULL DEFAULT 'US',
  confidence numeric NOT NULL DEFAULT 0,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mi_rec_status ON public.mi_recommendations(status, created_at DESC);

-- SEASONAL FORECASTS
CREATE TABLE public.mi_seasonal_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  week_of_year int NOT NULL,
  market text NOT NULL DEFAULT 'US',
  expected_lift numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ENABLE RLS
ALTER TABLE public.mi_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_trend_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_competitor_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_creative_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_remix_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mi_seasonal_forecasts ENABLE ROW LEVEL SECURITY;

-- ADMIN-ONLY POLICIES
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'mi_trends','mi_trend_signals','mi_competitors','mi_competitor_observations',
    'mi_creative_recipes','mi_remix_drafts','mi_opportunities','mi_recommendations',
    'mi_seasonal_forecasts'
  ]) LOOP
    EXECUTE format('CREATE POLICY "admin_all_%s" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t, t);
  END LOOP;
END $$;

-- TRIGGERS for updated_at
CREATE TRIGGER trg_mi_trends_updated BEFORE UPDATE ON public.mi_trends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mi_competitors_updated BEFORE UPDATE ON public.mi_competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mi_recipes_updated BEFORE UPDATE ON public.mi_creative_recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mi_remix_updated BEFORE UPDATE ON public.mi_remix_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mi_opp_updated BEFORE UPDATE ON public.mi_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mi_rec_updated BEFORE UPDATE ON public.mi_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- US-ONLY VIEWS
CREATE OR REPLACE VIEW public.us_mi_trends_v AS
  SELECT * FROM public.mi_trends WHERE market = 'US';
CREATE OR REPLACE VIEW public.us_mi_opportunities_v AS
  SELECT * FROM public.mi_opportunities WHERE market = 'US';
CREATE OR REPLACE VIEW public.us_mi_recommendations_v AS
  SELECT * FROM public.mi_recommendations WHERE market = 'US';
