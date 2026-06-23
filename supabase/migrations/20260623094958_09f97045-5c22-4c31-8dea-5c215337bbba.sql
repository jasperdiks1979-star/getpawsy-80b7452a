
ALTER TABLE public.product_intelligence
  ADD COLUMN IF NOT EXISTS revenue_priority_score_v2 numeric,
  ADD COLUMN IF NOT EXISTS revenue_tier text,
  ADD COLUMN IF NOT EXISTS pinterest_momentum_score numeric,
  ADD COLUMN IF NOT EXISTS score_components_v2 jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_v2_computed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_product_intelligence_rps_v2
  ON public.product_intelligence (revenue_priority_score_v2 DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_product_intelligence_revenue_tier
  ON public.product_intelligence (revenue_tier);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS margin_percent numeric;

INSERT INTO public.app_config (key, value)
VALUES ('revenue_priority_v2_active', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
