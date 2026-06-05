-- Phase 2: US warehouse normalization columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS warehouse_name text,
  ADD COLUMN IF NOT EXISTS estimated_delivery_days integer,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric,
  ADD COLUMN IF NOT EXISTS shipping_method text,
  ADD COLUMN IF NOT EXISTS shipping_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_us_warehouse boolean GENERATED ALWAYS AS (warehouse_country = 'US') STORED,
  ADD COLUMN IF NOT EXISTS is_fast_shipping boolean GENERATED ALWAYS AS (estimated_delivery_days IS NOT NULL AND estimated_delivery_days <= 7) STORED;

CREATE INDEX IF NOT EXISTS idx_products_us_fast ON public.products (is_us_warehouse, is_fast_shipping, stock) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_products_shipping_score ON public.products (shipping_score DESC) WHERE is_active;