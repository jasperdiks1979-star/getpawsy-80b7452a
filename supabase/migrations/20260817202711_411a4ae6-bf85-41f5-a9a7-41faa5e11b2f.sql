CREATE INDEX IF NOT EXISTS idx_products_variants_notnull ON public.products (id) WHERE variants IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pe_endpoint_checks_checked_ok ON public.pe_endpoint_checks (checked_at DESC, ok);
CREATE INDEX IF NOT EXISTS idx_pcie2_creatives_retired_embedding ON public.pcie2_creatives (retired) WHERE embedding IS NOT NULL;
ANALYZE public.bestsellers;