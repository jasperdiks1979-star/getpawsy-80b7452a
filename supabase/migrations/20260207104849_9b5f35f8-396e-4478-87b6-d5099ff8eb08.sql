-- Step 1: Add columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_sync_status text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_sync_error text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_source text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_warehouse text;

-- Step 2: Create stock_sync_logs table
CREATE TABLE IF NOT EXISTS public.stock_sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  total_checked integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  zero_stock_count integer NOT NULL DEFAULT 0,
  positive_stock_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  sample_errors jsonb,
  triggered_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read stock sync logs"
  ON public.stock_sync_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert stock sync logs"
  ON public.stock_sync_logs FOR INSERT
  WITH CHECK (true);

-- Step 3: Recreate view with new columns
DROP VIEW IF EXISTS public.products_public;

CREATE VIEW public.products_public
WITH (security_invoker = off)
AS
SELECT
  id, name, slug, description, price, compare_at_price,
  category, image_url, images, stock, sku, cj_product_id,
  variants, weight, shipping_time, is_active,
  created_at, updated_at,
  supplier_name, last_stock_sync_at,
  is_duplicate, canonical_product_id, dedupe_key,
  stock_sync_status, stock_source, supplier_warehouse
FROM public.products
WHERE is_active = true AND is_duplicate = false;