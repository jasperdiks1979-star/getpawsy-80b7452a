
-- Extend visitor scores
ALTER TABLE public.pinterest_visitor_revenue_scores
  ADD COLUMN IF NOT EXISTS visitor_quality_score smallint,
  ADD COLUMN IF NOT EXISTS intent_tier text,
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS scroll_depth_max smallint,
  ADD COLUMN IF NOT EXISTS image_interactions smallint,
  ADD COLUMN IF NOT EXISTS variant_selections smallint,
  ADD COLUMN IF NOT EXISTS return_visit boolean;

CREATE INDEX IF NOT EXISTS idx_pvrs_intent_tier
  ON public.pinterest_visitor_revenue_scores (intent_tier);
CREATE INDEX IF NOT EXISTS idx_pvrs_classification
  ON public.pinterest_visitor_revenue_scores (classification);

-- PDP conversion stats
CREATE TABLE IF NOT EXISTS public.pinterest_pdp_conversion_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  product_slug text,
  day date NOT NULL,
  views int NOT NULL DEFAULT 0,
  avg_scroll_pct numeric(5,2) NOT NULL DEFAULT 0,
  gallery_opens int NOT NULL DEFAULT 0,
  atc int NOT NULL DEFAULT 0,
  checkout int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  exit_rate numeric(5,2) NOT NULL DEFAULT 0,
  pinterest_clicks int NOT NULL DEFAULT 0,
  atc_rate numeric(6,4) NOT NULL DEFAULT 0,
  checkout_rate numeric(6,4) NOT NULL DEFAULT 0,
  purchase_rate numeric(6,4) NOT NULL DEFAULT 0,
  verdict text NOT NULL DEFAULT 'neutral',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, day)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_pdp_conversion_stats TO authenticated;
GRANT ALL ON public.pinterest_pdp_conversion_stats TO service_role;
ALTER TABLE public.pinterest_pdp_conversion_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read pdp conversion stats"
  ON public.pinterest_pdp_conversion_stats FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write pdp conversion stats"
  ON public.pinterest_pdp_conversion_stats FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pdp_stats_day ON public.pinterest_pdp_conversion_stats (day DESC);
CREATE INDEX IF NOT EXISTS idx_pdp_stats_verdict ON public.pinterest_pdp_conversion_stats (verdict);
CREATE INDEX IF NOT EXISTS idx_pdp_stats_product ON public.pinterest_pdp_conversion_stats (product_id);

-- Creative variants (hooks/benefits/CTAs; titles continue to use existing pinterest_title_variants)
CREATE TABLE IF NOT EXISTS public.pinterest_creative_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('hook','benefit','cta','title')),
  text text NOT NULL,
  score numeric(6,2) NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  impressions int NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, kind, text)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_creative_variants TO authenticated;
GRANT ALL ON public.pinterest_creative_variants TO service_role;
ALTER TABLE public.pinterest_creative_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read creative variants"
  ON public.pinterest_creative_variants FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write creative variants"
  ON public.pinterest_creative_variants FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_creative_variants_product_kind
  ON public.pinterest_creative_variants (product_id, kind);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdp_stats_updated ON public.pinterest_pdp_conversion_stats;
CREATE TRIGGER trg_pdp_stats_updated
  BEFORE UPDATE ON public.pinterest_pdp_conversion_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_creative_variants_updated ON public.pinterest_creative_variants;
CREATE TRIGGER trg_creative_variants_updated
  BEFORE UPDATE ON public.pinterest_creative_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
