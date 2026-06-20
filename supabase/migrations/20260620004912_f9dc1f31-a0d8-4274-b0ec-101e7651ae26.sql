-- Global Inventory & Revenue Engine V1
-- Adds generated columns for effective_stock, inventory_source, inventory_priority,
-- inventory_score and per-warehouse availability flags on public.products.
-- Adds product_replacement_candidates table for sold-out fallback recommendations.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS us_available boolean
    GENERATED ALWAYS AS (COALESCE(us_stock, 0) > 0) STORED,
  ADD COLUMN IF NOT EXISTS eu_available boolean
    GENERATED ALWAYS AS (COALESCE(eu_stock, 0) > 0) STORED,
  ADD COLUMN IF NOT EXISTS cn_available boolean
    GENERATED ALWAYS AS (COALESCE(cn_stock, 0) > 0) STORED,
  ADD COLUMN IF NOT EXISTS effective_stock integer
    GENERATED ALWAYS AS (
      CASE
        WHEN COALESCE(us_stock, 0) > 0 THEN us_stock
        WHEN COALESCE(eu_stock, 0) > 0 THEN eu_stock
        WHEN COALESCE(cn_stock, 0) > 0 THEN cn_stock
        ELSE 0
      END
    ) STORED,
  ADD COLUMN IF NOT EXISTS inventory_source text
    GENERATED ALWAYS AS (
      CASE
        WHEN COALESCE(us_stock, 0) > 0 THEN 'US'
        WHEN COALESCE(eu_stock, 0) > 0 THEN 'EU'
        WHEN COALESCE(cn_stock, 0) > 0 THEN 'CN'
        ELSE 'NONE'
      END
    ) STORED,
  ADD COLUMN IF NOT EXISTS inventory_priority integer
    GENERATED ALWAYS AS (
      CASE
        WHEN COALESCE(us_stock, 0) > 0 THEN 100
        WHEN COALESCE(eu_stock, 0) > 0 THEN 70
        WHEN COALESCE(cn_stock, 0) > 0 THEN 40
        ELSE 0
      END
    ) STORED,
  ADD COLUMN IF NOT EXISTS inventory_score integer
    GENERATED ALWAYS AS (
      CASE
        WHEN COALESCE(us_stock, 0) > 50 THEN 100
        WHEN COALESCE(us_stock, 0) BETWEEN 20 AND 50 THEN 90
        WHEN COALESCE(us_stock, 0) BETWEEN 1 AND 19 THEN 75
        WHEN COALESCE(eu_stock, 0) > 0 THEN 60
        WHEN COALESCE(cn_stock, 0) > 0 THEN 50
        ELSE 0
      END
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_effective_stock ON public.products(effective_stock);
CREATE INDEX IF NOT EXISTS idx_products_inventory_source ON public.products(inventory_source);
CREATE INDEX IF NOT EXISTS idx_products_inventory_priority ON public.products(inventory_priority DESC);

-- Replacement candidates table
CREATE TABLE IF NOT EXISTS public.product_replacement_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  candidate_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'sold_out_fallback',
  match_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, candidate_product_id)
);

GRANT SELECT ON public.product_replacement_candidates TO authenticated;
GRANT ALL ON public.product_replacement_candidates TO service_role;

ALTER TABLE public.product_replacement_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view replacement candidates"
  ON public.product_replacement_candidates
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages replacement candidates"
  ON public.product_replacement_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_replacement_candidates_product ON public.product_replacement_candidates(product_id);
