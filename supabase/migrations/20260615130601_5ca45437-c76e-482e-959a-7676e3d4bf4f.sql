
-- 5-class revenue tier per product
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_product_tiers (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text,
  category_key text,
  tier text NOT NULL CHECK (tier IN ('superstar','winner','average','weak','dead','discovery')),
  score numeric NOT NULL DEFAULT 0,
  publish_weight numeric NOT NULL DEFAULT 1,
  impressions_30d integer NOT NULL DEFAULT 0,
  clicks_30d integer NOT NULL DEFAULT 0,
  saves_30d integer NOT NULL DEFAULT 0,
  product_views_30d integer NOT NULL DEFAULT 0,
  add_to_carts_30d integer NOT NULL DEFAULT 0,
  purchases_30d integer NOT NULL DEFAULT 0,
  revenue_cents_30d integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prpt_tier_score ON public.pinterest_revenue_product_tiers(tier, score DESC);
GRANT SELECT ON public.pinterest_revenue_product_tiers TO authenticated;
GRANT ALL ON public.pinterest_revenue_product_tiers TO service_role;
ALTER TABLE public.pinterest_revenue_product_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read revenue product tiers" ON public.pinterest_revenue_product_tiers
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes revenue product tiers" ON public.pinterest_revenue_product_tiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Board-level performance + allocation
CREATE TABLE IF NOT EXISTS public.pinterest_board_performance (
  board_name text PRIMARY KEY,
  board_id text,
  impressions_30d integer NOT NULL DEFAULT 0,
  clicks_30d integer NOT NULL DEFAULT 0,
  saves_30d integer NOT NULL DEFAULT 0,
  purchases_30d integer NOT NULL DEFAULT 0,
  revenue_cents_30d integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  purchase_rate numeric NOT NULL DEFAULT 0,
  rank integer NOT NULL DEFAULT 0,
  publish_weight numeric NOT NULL DEFAULT 1,
  classification text NOT NULL DEFAULT 'average',
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pbp_rank ON public.pinterest_board_performance(rank);
GRANT SELECT ON public.pinterest_board_performance TO authenticated;
GRANT ALL ON public.pinterest_board_performance TO service_role;
ALTER TABLE public.pinterest_board_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read board performance" ON public.pinterest_board_performance
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes board performance" ON public.pinterest_board_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Daily report snapshots (immutable history)
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  pinterest_visitors integer NOT NULL DEFAULT 0,
  product_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue_cents integer NOT NULL DEFAULT 0,
  pins_published integer NOT NULL DEFAULT 0,
  superstar_count integer NOT NULL DEFAULT 0,
  winner_count integer NOT NULL DEFAULT 0,
  average_count integer NOT NULL DEFAULT 0,
  weak_count integer NOT NULL DEFAULT 0,
  dead_count integer NOT NULL DEFAULT 0,
  top_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_boards jsonb NOT NULL DEFAULT '[]'::jsonb,
  biggest_losers jsonb NOT NULL DEFAULT '[]'::jsonb,
  allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prdr_date ON public.pinterest_revenue_daily_reports(report_date DESC);
GRANT SELECT ON public.pinterest_revenue_daily_reports TO authenticated;
GRANT ALL ON public.pinterest_revenue_daily_reports TO service_role;
ALTER TABLE public.pinterest_revenue_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read daily reports" ON public.pinterest_revenue_daily_reports
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes daily reports" ON public.pinterest_revenue_daily_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
