
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cj_variant_id text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS variant_stock jsonb,
  ADD COLUMN IF NOT EXISTS inventory_source text DEFAULT 'cj',
  ADD COLUMN IF NOT EXISTS last_inventory_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inventory_sync_status text,
  ADD COLUMN IF NOT EXISTS last_inventory_sync_error text,
  ADD COLUMN IF NOT EXISTS inventory_manual_block boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_inventory_sync
  ON public.products (inventory_source, last_inventory_sync_at);
