
CREATE TABLE IF NOT EXISTS public.catalog_commerce_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text unique not null,
  source_run_id text not null,
  shop_domain text not null,
  location_id text not null,
  status text not null default 'preflight',
  phase text,
  current_wave integer default 0,
  current_cursor text,
  eligible_variants integer default 0,
  eligible_products integer default 0,
  wave1_target integer default 0,
  wave2_target integer default 0,
  wave3_target integer default 0,
  inventory_success integer default 0,
  inventory_failed integer default 0,
  activations integer default 0,
  publications integer default 0,
  rollbacks integer default 0,
  storefront_tests integer default 0,
  add_to_cart_tests integer default 0,
  checkout_tests integer default 0,
  shopify_mutations integer default 0,
  cj_requests integer default 0,
  preflight jsonb,
  final_report jsonb,
  stop_reason text,
  cron_job_id integer,
  cron_active boolean default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_commerce_runs TO authenticated;
GRANT ALL ON public.catalog_commerce_runs TO service_role;
ALTER TABLE public.catalog_commerce_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commerce_runs_admin_read" ON public.catalog_commerce_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commerce_runs_service_all" ON public.catalog_commerce_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.catalog_commerce_items (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.catalog_commerce_runs(run_id) on delete cascade,
  wave integer not null default 1,
  product_id text not null,
  variant_id text not null,
  inventory_item_id text not null,
  location_id text not null,
  sku text not null,
  cj_pid text,
  cj_vid text,
  cj_variant_sku text,
  previous_on_hand integer,
  previous_available integer,
  target_on_hand integer,
  applied_on_hand integer,
  readback1 jsonb,
  readback2 jsonb,
  cj_us_stock_live integer,
  cj_status_live text,
  status text not null default 'pending',
  block_reason text,
  activated boolean default false,
  published boolean default false,
  storefront_ok boolean,
  cart_ok boolean,
  checkout_ok boolean,
  rollback_state text,
  retries integer default 0,
  idempotency_key text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, variant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_commerce_items TO authenticated;
GRANT ALL ON public.catalog_commerce_items TO service_role;
ALTER TABLE public.catalog_commerce_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commerce_items_admin_read" ON public.catalog_commerce_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "commerce_items_service_all" ON public.catalog_commerce_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_commerce_items_run_status ON public.catalog_commerce_items(run_id, status);
CREATE INDEX IF NOT EXISTS idx_commerce_items_run_wave ON public.catalog_commerce_items(run_id, wave, status);
