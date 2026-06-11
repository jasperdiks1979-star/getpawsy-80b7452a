
-- 1. Revenue opportunity scores
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  product_slug text,
  score_0_1000 integer NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  bestseller_p numeric(5,4) DEFAULT 0,
  viral_p numeric(5,4) DEFAULT 0,
  repeat_p numeric(5,4) DEFAULT 0,
  tier text NOT NULL DEFAULT 'neutral',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_opp_score_desc ON public.pinterest_revenue_opportunity_scores (score_0_1000 DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_opp_tier ON public.pinterest_revenue_opportunity_scores (tier);
GRANT SELECT ON public.pinterest_revenue_opportunity_scores TO authenticated;
GRANT ALL ON public.pinterest_revenue_opportunity_scores TO service_role;
ALTER TABLE public.pinterest_revenue_opportunity_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read revenue opp scores" ON public.pinterest_revenue_opportunity_scores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Revenue forecasts
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  horizon integer NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  atc integer NOT NULL DEFAULT 0,
  checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, horizon)
);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_product ON public.pinterest_revenue_forecasts (product_id);
GRANT SELECT ON public.pinterest_revenue_forecasts TO authenticated;
GRANT ALL ON public.pinterest_revenue_forecasts TO service_role;
ALTER TABLE public.pinterest_revenue_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read revenue forecasts" ON public.pinterest_revenue_forecasts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Trend intelligence
CREATE TABLE IF NOT EXISTS public.pinterest_trend_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  source text NOT NULL DEFAULT 'internal',
  velocity numeric(5,4) NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'stable',
  seasonality_score numeric(4,3) DEFAULT 0,
  growth_rate numeric(6,4) DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword, source)
);
CREATE INDEX IF NOT EXISTS idx_trend_intel_velocity ON public.pinterest_trend_intelligence (velocity DESC);
GRANT SELECT ON public.pinterest_trend_intelligence TO authenticated;
GRANT ALL ON public.pinterest_trend_intelligence TO service_role;
ALTER TABLE public.pinterest_trend_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read trend intel" ON public.pinterest_trend_intelligence
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. Brain runs
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_brain_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  mode text NOT NULL DEFAULT 'cron',
  products_scanned integer NOT NULL DEFAULT 0,
  scores_written integer NOT NULL DEFAULT 0,
  forecasts_written integer NOT NULL DEFAULT 0,
  opportunities_found integer NOT NULL DEFAULT 0,
  drafts_promoted integer NOT NULL DEFAULT 0,
  top_products jsonb DEFAULT '[]'::jsonb,
  health jsonb DEFAULT '{}'::jsonb,
  errors integer NOT NULL DEFAULT 0,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_brain_runs_started ON public.pinterest_revenue_brain_runs (started_at DESC);
GRANT SELECT ON public.pinterest_revenue_brain_runs TO authenticated;
GRANT ALL ON public.pinterest_revenue_brain_runs TO service_role;
ALTER TABLE public.pinterest_revenue_brain_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read revenue brain runs" ON public.pinterest_revenue_brain_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Cron: nightly 03:45 UTC
SELECT cron.schedule(
  'pinterest-revenue-brain-nightly',
  '45 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-revenue-brain',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc"}'::jsonb,
    body := '{"action":"run_full","mode":"cron"}'::jsonb
  );
  $$
);
