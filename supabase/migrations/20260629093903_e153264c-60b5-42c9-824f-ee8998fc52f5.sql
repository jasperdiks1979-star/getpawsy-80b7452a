
-- Wave 1: GA4 MP idempotency flag
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ga4_mp_sent_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ga_client_id text;

-- Wave 2: Conversion Reality tables
CREATE TABLE IF NOT EXISTS public.conversion_reality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  window_hours integer NOT NULL DEFAULT 24,
  sessions_total integer NOT NULL DEFAULT 0,
  pageviews_total integer NOT NULL DEFAULT 0,
  pdp_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  begin_checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue_usd numeric NOT NULL DEFAULT 0,
  traffic_quality_score numeric NOT NULL DEFAULT 0,
  mismatch_rate_pct numeric NOT NULL DEFAULT 0,
  pdp_conversion_pct numeric NOT NULL DEFAULT 0,
  checkout_start_pct numeric NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversion_reality_runs TO authenticated;
GRANT ALL ON public.conversion_reality_runs TO service_role;
ALTER TABLE public.conversion_reality_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read conversion_reality_runs" ON public.conversion_reality_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.conversion_reality_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.conversion_reality_runs(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_slug text,
  pdp_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  begin_checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  pdp_to_atc_pct numeric NOT NULL DEFAULT 0,
  atc_to_checkout_pct numeric NOT NULL DEFAULT 0,
  leak_step text,
  leak_severity numeric NOT NULL DEFAULT 0,
  recommended_fix text,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversion_reality_products TO authenticated;
GRANT ALL ON public.conversion_reality_products TO service_role;
ALTER TABLE public.conversion_reality_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read conversion_reality_products" ON public.conversion_reality_products
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_crp_run ON public.conversion_reality_products(run_id);
CREATE INDEX IF NOT EXISTS idx_crp_leak_sev ON public.conversion_reality_products(leak_severity DESC);

CREATE TABLE IF NOT EXISTS public.conversion_reality_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.conversion_reality_runs(id) ON DELETE CASCADE,
  source text,
  medium text,
  campaign text,
  country text,
  device text,
  sessions integer NOT NULL DEFAULT 0,
  pdp_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  traffic_quality_score numeric NOT NULL DEFAULT 0,
  conversion_pct numeric NOT NULL DEFAULT 0,
  mismatch_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversion_reality_segments TO authenticated;
GRANT ALL ON public.conversion_reality_segments TO service_role;
ALTER TABLE public.conversion_reality_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read conversion_reality_segments" ON public.conversion_reality_segments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_crs_run ON public.conversion_reality_segments(run_id);
