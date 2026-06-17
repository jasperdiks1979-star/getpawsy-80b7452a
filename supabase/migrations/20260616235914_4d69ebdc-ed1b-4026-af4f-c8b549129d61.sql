ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_clean text,
  ADD COLUMN IF NOT EXISTS name_clean_updated_at timestamptz;

COMMENT ON COLUMN public.products.name_clean IS 'AI-rewritten US-shopper-friendly product headline (50–65 chars). UI/feed/pin generators prefer this over name when present.';