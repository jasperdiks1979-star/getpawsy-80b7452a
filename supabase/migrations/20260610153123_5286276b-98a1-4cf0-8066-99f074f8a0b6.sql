
-- 1. Keyword bank
CREATE TABLE IF NOT EXISTS public.pinterest_keyword_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text,
  niche text,
  keyword text NOT NULL,
  source text NOT NULL DEFAULT 'ai_expander', -- ai_expander | seed | winning_pin | trend
  score numeric DEFAULT 50,
  ctr_observed numeric,
  used_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, keyword)
);
GRANT SELECT ON public.pinterest_keyword_bank TO authenticated;
GRANT ALL ON public.pinterest_keyword_bank TO service_role;
ALTER TABLE public.pinterest_keyword_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read keyword bank" ON public.pinterest_keyword_bank FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pkb_product ON public.pinterest_keyword_bank(product_id);
CREATE INDEX IF NOT EXISTS idx_pkb_niche_score ON public.pinterest_keyword_bank(niche, score DESC);

-- 2. Title variants
CREATE TABLE IF NOT EXISTS public.pinterest_title_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text,
  niche text,
  title text NOT NULL,
  word_count integer NOT NULL,
  modifier_type text, -- state | city | apartment | family | indoor | small_space | luxury
  used_count integer NOT NULL DEFAULT 0,
  ctr_observed numeric,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, title)
);
GRANT SELECT ON public.pinterest_title_variants TO authenticated;
GRANT ALL ON public.pinterest_title_variants TO service_role;
ALTER TABLE public.pinterest_title_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read title variants" ON public.pinterest_title_variants FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_ptv_product ON public.pinterest_title_variants(product_id);

-- 3. Daily US share snapshots
CREATE TABLE IF NOT EXISTS public.pinterest_us_share_daily (
  day date PRIMARY KEY,
  total_clicks integer NOT NULL DEFAULT 0,
  us_clicks integer NOT NULL DEFAULT 0,
  ca_clicks integer NOT NULL DEFAULT 0,
  au_clicks integer NOT NULL DEFAULT 0,
  other_clicks integer NOT NULL DEFAULT 0,
  us_share numeric,
  tier1_share numeric, -- US+CA+AU combined
  weighted_score numeric, -- US*5 + CA*3 + AU*2 + others*0.5 normalized
  top_us_boards jsonb,
  top_us_products jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_us_share_daily TO authenticated;
GRANT ALL ON public.pinterest_us_share_daily TO service_role;
ALTER TABLE public.pinterest_us_share_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read us share" ON public.pinterest_us_share_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 4. Product tiers (winner/neutral/loser)
CREATE TABLE IF NOT EXISTS public.pinterest_product_tiers (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text,
  tier text NOT NULL CHECK (tier IN ('winner','neutral','loser','untested')),
  score numeric NOT NULL DEFAULT 0,
  reason text,
  impressions_30d integer DEFAULT 0,
  outbound_clicks_30d integer DEFAULT 0,
  add_to_carts_30d integer DEFAULT 0,
  purchases_30d integer DEFAULT 0,
  revenue_cents_30d integer DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_product_tiers TO authenticated;
GRANT ALL ON public.pinterest_product_tiers TO service_role;
ALTER TABLE public.pinterest_product_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read product tiers" ON public.pinterest_product_tiers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_ppt_tier_score ON public.pinterest_product_tiers(tier, score DESC);

-- 5. Add board health + tier columns
ALTER TABLE public.pinterest_boards
  ADD COLUMN IF NOT EXISTS health_score numeric,
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('top','mid','low','blacklisted')),
  ADD COLUMN IF NOT EXISTS us_share_30d numeric,
  ADD COLUMN IF NOT EXISTS clicks_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_cents_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;
