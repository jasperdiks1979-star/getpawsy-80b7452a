
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_attribution_v3 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  window_days integer NOT NULL CHECK (window_days IN (1,7,30)),
  product_id text,
  product_slug text,
  board text,
  headline text,
  cta text,
  hook text,
  creative_angle text,
  category text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  product_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  orders integer NOT NULL DEFAULT 0,
  revenue_per_click numeric NOT NULL DEFAULT 0,
  revenue_per_pin numeric NOT NULL DEFAULT 0,
  roas numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, window_days)
);
CREATE INDEX IF NOT EXISTS idx_pra3_window_revenue ON public.pinterest_revenue_attribution_v3 (window_days, revenue_cents DESC);
CREATE INDEX IF NOT EXISTS idx_pra3_category ON public.pinterest_revenue_attribution_v3 (category);

GRANT SELECT ON public.pinterest_revenue_attribution_v3 TO authenticated;
GRANT ALL ON public.pinterest_revenue_attribution_v3 TO service_role;
ALTER TABLE public.pinterest_revenue_attribution_v3 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pra3" ON public.pinterest_revenue_attribution_v3
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pinterest_revenue_learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  pins_scanned integer NOT NULL DEFAULT 0,
  top_pins_cloned integer NOT NULL DEFAULT 0,
  bottom_pins_throttled integer NOT NULL DEFAULT 0,
  total_revenue_cents bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.pinterest_revenue_learning_runs TO authenticated;
GRANT ALL ON public.pinterest_revenue_learning_runs TO service_role;
ALTER TABLE public.pinterest_revenue_learning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read prlr" ON public.pinterest_revenue_learning_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
