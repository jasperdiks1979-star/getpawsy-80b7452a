
-- 1. winner_products
CREATE TABLE public.winner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  score numeric NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_protected boolean NOT NULL DEFAULT true,
  niche text,
  recovery_mode boolean NOT NULL DEFAULT false,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_winner_products_score ON public.winner_products (score DESC);
CREATE INDEX idx_winner_products_protected ON public.winner_products (is_protected) WHERE is_protected = true;

GRANT SELECT ON public.winner_products TO authenticated;
GRANT ALL ON public.winner_products TO service_role;
ALTER TABLE public.winner_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "winner_products admin manage" ON public.winner_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "winner_products read" ON public.winner_products FOR SELECT TO authenticated USING (true);

-- 2. product_global_inventory
CREATE TABLE public.product_global_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  supplier text NOT NULL DEFAULT 'cj',
  warehouse text NOT NULL,
  country_code text,
  qty integer NOT NULL DEFAULT 0,
  shipping_days_min integer,
  shipping_days_max integer,
  cost_cents integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier, warehouse)
);
CREATE INDEX idx_pgi_product ON public.product_global_inventory (product_id);
CREATE INDEX idx_pgi_checked ON public.product_global_inventory (last_checked_at DESC);

GRANT SELECT ON public.product_global_inventory TO authenticated;
GRANT ALL ON public.product_global_inventory TO service_role;
ALTER TABLE public.product_global_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pgi admin manage" ON public.product_global_inventory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pgi read" ON public.product_global_inventory FOR SELECT TO authenticated USING (true);

-- 3. product_supplier_candidates
CREATE TABLE public.product_supplier_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  supplier text NOT NULL DEFAULT 'cj',
  supplier_product_id text NOT NULL,
  supplier_sku text,
  title text,
  image_url text,
  price_cents integer,
  global_qty integer NOT NULL DEFAULT 0,
  warehouses jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_score numeric NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier, supplier_product_id)
);
CREATE INDEX idx_psc_product ON public.product_supplier_candidates (product_id);
CREATE INDEX idx_psc_status ON public.product_supplier_candidates (status);

GRANT SELECT ON public.product_supplier_candidates TO authenticated;
GRANT ALL ON public.product_supplier_candidates TO service_role;
ALTER TABLE public.product_supplier_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psc admin manage" ON public.product_supplier_candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. product_supplier_swaps
CREATE TABLE public.product_supplier_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  from_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  executed_by uuid,
  rolled_back_at timestamptz,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pss_product ON public.product_supplier_swaps (product_id, executed_at DESC);

GRANT SELECT ON public.product_supplier_swaps TO authenticated;
GRANT ALL ON public.product_supplier_swaps TO service_role;
ALTER TABLE public.product_supplier_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pss admin manage" ON public.product_supplier_swaps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. recovery_engine_runs
CREATE TABLE public.recovery_engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'cron',
  scanned int NOT NULL DEFAULT 0,
  audited int NOT NULL DEFAULT 0,
  swapped int NOT NULL DEFAULT 0,
  replaced int NOT NULL DEFAULT 0,
  deactivated int NOT NULL DEFAULT 0,
  alerts int NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_rer_started ON public.recovery_engine_runs (started_at DESC);

GRANT SELECT ON public.recovery_engine_runs TO authenticated;
GRANT ALL ON public.recovery_engine_runs TO service_role;
ALTER TABLE public.recovery_engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rer admin manage" ON public.recovery_engine_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger for winner_products
CREATE TRIGGER trg_winner_products_updated
  BEFORE UPDATE ON public.winner_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
