
CREATE TABLE IF NOT EXISTS public.pinterest_attribution_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_at timestamptz NOT NULL DEFAULT now(),
  window_hours integer NOT NULL DEFAULT 24,
  pinterest_clicks integer NOT NULL DEFAULT 0,
  attributed_clicks integer NOT NULL DEFAULT 0,
  pinterest_sessions integer NOT NULL DEFAULT 0,
  attributed_sessions integer NOT NULL DEFAULT 0,
  product_views integer NOT NULL DEFAULT 0,
  attributed_product_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  attributed_add_to_carts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  attributed_purchases integer NOT NULL DEFAULT 0,
  coverage_pct numeric NOT NULL DEFAULT 0,
  broken_chains integer NOT NULL DEFAULT 0,
  repaired integer NOT NULL DEFAULT 0,
  alert_level text NOT NULL DEFAULT 'ok',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_attribution_health TO authenticated;
GRANT ALL ON public.pinterest_attribution_health TO service_role;
ALTER TABLE public.pinterest_attribution_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read attribution health"
  ON public.pinterest_attribution_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service writes attribution health"
  ON public.pinterest_attribution_health FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pinterest_attribution_health_report_at
  ON public.pinterest_attribution_health (report_at DESC);
