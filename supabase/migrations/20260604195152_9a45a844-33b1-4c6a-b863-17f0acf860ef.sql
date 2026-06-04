
-- Extend product_media with CJ linkage + variant key + metadata, and add a
-- unique constraint that prevents duplicate imports per (product, supplier_url).
ALTER TABLE public.product_media
  ADD COLUMN IF NOT EXISTS cj_product_id text,
  ADD COLUMN IF NOT EXISTS variant_key text,
  ADD COLUMN IF NOT EXISTS variant_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS product_media_cj_product_id_idx ON public.product_media(cj_product_id);
CREATE INDEX IF NOT EXISTS product_media_product_type_idx ON public.product_media(product_id, media_type);

-- Idempotent dedupe by (product, supplier_url) when supplier_url present.
CREATE UNIQUE INDEX IF NOT EXISTS product_media_product_supplier_uidx
  ON public.product_media(product_id, supplier_url)
  WHERE supplier_url IS NOT NULL;
