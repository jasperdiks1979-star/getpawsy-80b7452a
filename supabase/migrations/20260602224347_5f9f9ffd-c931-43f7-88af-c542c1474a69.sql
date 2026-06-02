
-- =========================
-- 1. product_media
-- =========================
CREATE TABLE public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  storage_url text NOT NULL,
  supplier_url text,
  sort_order int NOT NULL DEFAULT 100,
  alt_text text,
  source text NOT NULL DEFAULT 'cj',
  checksum text,
  duration_sec numeric,
  file_size bigint,
  width int,
  height int,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_product_media_dedupe
  ON public.product_media(product_id, checksum)
  WHERE checksum IS NOT NULL;
CREATE INDEX idx_product_media_product ON public.product_media(product_id, media_type, sort_order);

GRANT SELECT ON public.product_media TO anon, authenticated;
GRANT ALL ON public.product_media TO service_role;

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view product media"
  ON public.product_media FOR SELECT
  USING (true);

CREATE POLICY "Admins manage product media"
  ON public.product_media FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role')
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role');

-- =========================
-- 2. cj_sync_runs
-- =========================
CREATE TABLE public.cj_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  mode text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'running',
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text,
  error text
);

CREATE INDEX idx_cj_sync_runs_started ON public.cj_sync_runs(started_at DESC);

GRANT SELECT ON public.cj_sync_runs TO authenticated;
GRANT ALL ON public.cj_sync_runs TO service_role;

ALTER TABLE public.cj_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sync runs"
  ON public.cj_sync_runs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service manages sync runs"
  ON public.cj_sync_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =========================
-- 3. cj_sync_items
-- =========================
CREATE TABLE public.cj_sync_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.cj_sync_runs(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cj_sync_items_run ON public.cj_sync_items(run_id, action);
CREATE INDEX idx_cj_sync_items_product ON public.cj_sync_items(product_id);

GRANT SELECT ON public.cj_sync_items TO authenticated;
GRANT ALL ON public.cj_sync_items TO service_role;

ALTER TABLE public.cj_sync_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sync items"
  ON public.cj_sync_items FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service manages sync items"
  ON public.cj_sync_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =========================
-- 4. products columns
-- =========================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS landed_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS estimated_shipping_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS shipping_days_min int,
  ADD COLUMN IF NOT EXISTS shipping_days_max int,
  ADD COLUMN IF NOT EXISTS warehouse_country text,
  ADD COLUMN IF NOT EXISTS margin_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS price_sync_status text,
  ADD COLUMN IF NOT EXISTS price_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipping_sync_status text,
  ADD COLUMN IF NOT EXISTS cj_media_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_admin_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_review_reason text,
  ADD COLUMN IF NOT EXISTS shipping_estimate_confidence text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS calculated_price numeric(10,2);

NOTIFY pgrst, 'reload schema';
