
-- Step B: Read-only catalog classification orchestrator tables
CREATE TABLE IF NOT EXISTS public.catalog_classification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'created',
  phase text,
  resolver_version text,
  shop_domain text,
  total_products int DEFAULT 0,
  total_variants int DEFAULT 0,
  snapshot_variants int DEFAULT 0,
  classified_variants int DEFAULT 0,
  current_cursor text,
  requests_used int DEFAULT 0,
  retries_used int DEFAULT 0,
  errors_count int DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  final_report jsonb,
  stop_reason text,
  cron_job_id bigint,
  cron_active boolean DEFAULT false
);

GRANT SELECT ON public.catalog_classification_runs TO authenticated;
GRANT ALL ON public.catalog_classification_runs TO service_role;
ALTER TABLE public.catalog_classification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc all runs" ON public.catalog_classification_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read runs" ON public.catalog_classification_runs FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.catalog_classification_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  product_id text,
  variant_id text NOT NULL,
  inventory_item_id text,
  inventory_level_id text,
  location_id text,
  product_title text,
  variant_title text,
  handle text,
  product_status text,
  published_to_online_store boolean,
  sku text,
  sku_occurrence_count int,
  price numeric,
  compare_at_price numeric,
  image_present boolean,
  tracked boolean,
  current_available int,
  current_on_hand int,
  requires_shipping boolean,
  weight numeric,
  weight_unit text,
  preclassification text,
  final_classification text,
  block_reason text,
  cj_pid text,
  cj_vid text,
  cj_variant_sku text,
  cj_product_status text,
  semantic_match boolean,
  us_stock int,
  cn_stock int,
  other_stock int,
  proposed_target_available int,
  proposed_delta int,
  future_mutation_eligible boolean,
  future_activation_eligible boolean,
  duplicate_group_key text,
  duplicate_classification text,
  proposed_canonical_product_id text,
  malformed_reason text,
  proposed_sku_correction text,
  proposed_sku_auto_safe boolean,
  resolver_requests int DEFAULT 0,
  retry_count int DEFAULT 0,
  last_error text,
  classified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (run_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_ccv_run_status ON public.catalog_classification_variants (run_id, final_classification);
CREATE INDEX IF NOT EXISTS idx_ccv_run_pending ON public.catalog_classification_variants (run_id) WHERE final_classification IS NULL;

GRANT SELECT ON public.catalog_classification_variants TO authenticated;
GRANT ALL ON public.catalog_classification_variants TO service_role;
ALTER TABLE public.catalog_classification_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc all cv" ON public.catalog_classification_variants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read cv" ON public.catalog_classification_variants FOR SELECT TO authenticated USING (true);
