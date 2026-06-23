ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS revenue_priority_score_v2 numeric,
  ADD COLUMN IF NOT EXISTS revenue_tier text,
  ADD COLUMN IF NOT EXISTS score_components_v2 jsonb,
  ADD COLUMN IF NOT EXISTS revenue_priority_v2_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_revenue_tier ON public.products(revenue_tier) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_products_revenue_priority_score_v2 ON public.products(revenue_priority_score_v2 DESC NULLS LAST) WHERE is_active;

INSERT INTO public.app_config (key, value)
VALUES ('revenue_priority_v2_active', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;