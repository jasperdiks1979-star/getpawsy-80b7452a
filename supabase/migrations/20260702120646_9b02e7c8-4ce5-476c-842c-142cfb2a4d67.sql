
ALTER TABLE public.analytics_funnel_waterfall
  ADD COLUMN IF NOT EXISTS source_page text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS variant_id text,
  ADD COLUMN IF NOT EXISTS collection_id text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS session_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_step text,
  ADD COLUMN IF NOT EXISTS last_step_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_afw_product_id ON public.analytics_funnel_waterfall(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_afw_source_page ON public.analytics_funnel_waterfall(source_page) WHERE source_page IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_afw_utm_source ON public.analytics_funnel_waterfall(utm_source) WHERE utm_source IS NOT NULL;
