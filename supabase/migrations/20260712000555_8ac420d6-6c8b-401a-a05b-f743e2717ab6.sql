
-- 1. INDEX
CREATE TABLE public.catalog_recovery_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id text NOT NULL,
  shopify_variant_id text NOT NULL UNIQUE,
  inventory_item_id text,
  handle text,
  sku text,
  barcode text,
  vendor text,
  title text,
  variant_title text,
  product_type text,
  current_inventory integer,
  current_location text,
  scan_hash text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.catalog_recovery_index TO service_role;
GRANT SELECT ON public.catalog_recovery_index TO authenticated;
ALTER TABLE public.catalog_recovery_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read index" ON public.catalog_recovery_index FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_cri_sku ON public.catalog_recovery_index(sku);
CREATE INDEX idx_cri_product ON public.catalog_recovery_index(shopify_product_id);

-- 2. MAPPINGS
CREATE TABLE public.catalog_recovery_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_variant_id text NOT NULL UNIQUE,
  shopify_product_id text NOT NULL,
  cj_pid text,
  cj_vid text,
  cj_sku text,
  warehouse text,
  confidence numeric NOT NULL,
  method text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory_synced_at timestamptz,
  inventory_qty integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.catalog_recovery_mappings TO service_role;
GRANT SELECT ON public.catalog_recovery_mappings TO authenticated;
ALTER TABLE public.catalog_recovery_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read mappings" ON public.catalog_recovery_mappings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_crm_method ON public.catalog_recovery_mappings(method);

-- 3. MEMORY
CREATE TABLE public.catalog_recovery_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,
  pattern_key text NOT NULL,
  cj_supplier_id text,
  cj_hint jsonb NOT NULL DEFAULT '{}'::jsonb,
  hit_count integer NOT NULL DEFAULT 1,
  confidence_boost numeric NOT NULL DEFAULT 0,
  last_used timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_type, pattern_key)
);
GRANT ALL ON public.catalog_recovery_memory TO service_role;
GRANT SELECT ON public.catalog_recovery_memory TO authenticated;
ALTER TABLE public.catalog_recovery_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read memory" ON public.catalog_recovery_memory FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 4. BATCHES
CREATE TABLE public.catalog_recovery_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cursor integer NOT NULL,
  size integer NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.catalog_recovery_batches TO service_role;
GRANT SELECT ON public.catalog_recovery_batches TO authenticated;
ALTER TABLE public.catalog_recovery_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read batches" ON public.catalog_recovery_batches FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_crb_status ON public.catalog_recovery_batches(status);

-- 5. EVENTS
CREATE TABLE public.catalog_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid,
  shopify_variant_id text,
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.catalog_recovery_events TO service_role;
GRANT SELECT ON public.catalog_recovery_events TO authenticated;
ALTER TABLE public.catalog_recovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read events" ON public.catalog_recovery_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_cre_created ON public.catalog_recovery_events(created_at DESC);

-- 6. SKU ISSUES
CREATE TABLE public.catalog_recovery_sku_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_variant_id text NOT NULL,
  issue_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shopify_variant_id, issue_type)
);
GRANT ALL ON public.catalog_recovery_sku_issues TO service_role;
GRANT SELECT ON public.catalog_recovery_sku_issues TO authenticated;
ALTER TABLE public.catalog_recovery_sku_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read sku issues" ON public.catalog_recovery_sku_issues FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
