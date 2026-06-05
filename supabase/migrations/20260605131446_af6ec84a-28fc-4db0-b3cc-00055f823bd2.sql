
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gtin text,
  ADD COLUMN IF NOT EXISTS mpn text,
  ADD COLUMN IF NOT EXISTS identifier_exists boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS availability text;

CREATE INDEX IF NOT EXISTS idx_products_identifier_exists ON public.products(identifier_exists);
