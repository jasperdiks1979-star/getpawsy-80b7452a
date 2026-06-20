
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS us_stock integer,
  ADD COLUMN IF NOT EXISTS eu_stock integer,
  ADD COLUMN IF NOT EXISTS cn_stock integer,
  ADD COLUMN IF NOT EXISTS primary_warehouse text,
  ADD COLUMN IF NOT EXISTS fallback_active boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS products_primary_warehouse_idx ON public.products(primary_warehouse);
CREATE INDEX IF NOT EXISTS products_fallback_active_idx ON public.products(fallback_active) WHERE fallback_active = true;

CREATE TABLE IF NOT EXISTS public.warehouse_revenue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  event text NOT NULL CHECK (event IN ('us_only_sale','cn_fallback_sale','eu_fallback_sale','missed_sold_out')),
  order_id uuid,
  amount numeric(10,2),
  warehouse_source text,
  meta jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.warehouse_revenue_log TO authenticated;
GRANT ALL ON public.warehouse_revenue_log TO service_role;

ALTER TABLE public.warehouse_revenue_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read warehouse revenue log"
  ON public.warehouse_revenue_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages warehouse revenue log"
  ON public.warehouse_revenue_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS warehouse_revenue_log_event_idx ON public.warehouse_revenue_log(event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS warehouse_revenue_log_product_idx ON public.warehouse_revenue_log(product_id, occurred_at DESC);
