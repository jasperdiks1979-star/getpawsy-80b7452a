
CREATE TABLE IF NOT EXISTS public.catalog_exception_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE,
  source_step_b_run TEXT NOT NULL,
  source_step_c_run TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  phase TEXT NOT NULL DEFAULT 'seed',
  current_wave INT NOT NULL DEFAULT 1,
  items_total INT NOT NULL DEFAULT 0,
  items_done INT NOT NULL DEFAULT 0,
  identity_drift_recovered INT NOT NULL DEFAULT 0,
  not_found_recovered INT NOT NULL DEFAULT 0,
  duplicates_canonicalized INT NOT NULL DEFAULT 0,
  duplicates_archived INT NOT NULL DEFAULT 0,
  malformed_repaired INT NOT NULL DEFAULT 0,
  non_us_sellable INT NOT NULL DEFAULT 0,
  inventory_success INT NOT NULL DEFAULT 0,
  inventory_failed INT NOT NULL DEFAULT 0,
  activations INT NOT NULL DEFAULT 0,
  publications INT NOT NULL DEFAULT 0,
  rollbacks INT NOT NULL DEFAULT 0,
  shopify_mutations INT NOT NULL DEFAULT 0,
  cj_requests INT NOT NULL DEFAULT 0,
  cart_tests INT NOT NULL DEFAULT 0,
  checkout_tests INT NOT NULL DEFAULT 0,
  circuit_breaker_triggered BOOLEAN NOT NULL DEFAULT false,
  cron_active BOOLEAN NOT NULL DEFAULT false,
  cron_job_id BIGINT,
  final_report JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT ALL ON public.catalog_exception_runs TO service_role;
ALTER TABLE public.catalog_exception_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read exception runs" ON public.catalog_exception_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.catalog_exception_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES public.catalog_exception_runs(run_id) ON DELETE CASCADE,
  wave INT NOT NULL DEFAULT 1,
  source_kind TEXT NOT NULL,
  source_classification TEXT,
  product_id TEXT,
  variant_id TEXT NOT NULL,
  inventory_item_id TEXT,
  location_id TEXT,
  handle TEXT,
  product_title TEXT,
  previous_sku TEXT,
  current_sku TEXT,
  proposed_sku TEXT,
  previous_status TEXT,
  previous_published BOOLEAN,
  cj_pid TEXT,
  cj_vid TEXT,
  cj_variant_sku TEXT,
  cj_status_live TEXT,
  cj_us_stock_live INT,
  duplicate_group_key TEXT,
  duplicate_role TEXT,
  canonical_product_id TEXT,
  previous_on_hand INT,
  target_on_hand INT,
  applied_on_hand INT,
  readback1 JSONB,
  readback2 JSONB,
  activated BOOLEAN NOT NULL DEFAULT false,
  published BOOLEAN NOT NULL DEFAULT false,
  storefront_ok BOOLEAN,
  cart_ok BOOLEAN,
  checkout_ok BOOLEAN,
  status TEXT NOT NULL DEFAULT 'pending',
  final_classification TEXT,
  block_reason TEXT,
  rollback_state TEXT,
  retries INT NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.catalog_exception_items TO service_role;
ALTER TABLE public.catalog_exception_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read exception items" ON public.catalog_exception_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_exc_items_run_wave_status ON public.catalog_exception_items (run_id, wave, status, retries);
CREATE INDEX IF NOT EXISTS idx_exc_items_source_kind ON public.catalog_exception_items (run_id, source_kind);
CREATE INDEX IF NOT EXISTS idx_exc_items_variant ON public.catalog_exception_items (variant_id);
