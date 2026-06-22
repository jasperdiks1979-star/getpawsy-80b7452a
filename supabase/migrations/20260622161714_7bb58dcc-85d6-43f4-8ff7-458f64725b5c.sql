
ALTER TABLE public.product_intelligence
  ADD COLUMN IF NOT EXISTS google_category_path text,
  ADD COLUMN IF NOT EXISTS pinterest_interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pinterest_audience jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seasonality jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_boards jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pinterest_title text,
  ADD COLUMN IF NOT EXISTS primary_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pinterest_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric,
  ADD COLUMN IF NOT EXISTS trend_score numeric,
  ADD COLUMN IF NOT EXISTS trend_reason text,
  ADD COLUMN IF NOT EXISTS conversion_score numeric,
  ADD COLUMN IF NOT EXISTS merchant_feed_quality_score numeric,
  ADD COLUMN IF NOT EXISTS priority_level text,
  ADD COLUMN IF NOT EXISTS feed_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feed_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS idx_product_intelligence_priority ON public.product_intelligence(priority_level);
CREATE INDEX IF NOT EXISTS idx_product_intelligence_trend ON public.product_intelligence(trend_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_product_intelligence_conv ON public.product_intelligence(conversion_score DESC NULLS LAST);
