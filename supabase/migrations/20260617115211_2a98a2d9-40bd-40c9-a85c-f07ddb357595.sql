
CREATE TABLE IF NOT EXISTS public.pinterest_regeneration_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  product_slug TEXT,
  product_name TEXT,
  legacy_pin_count INT NOT NULL DEFAULT 0,
  legacy_live_count INT NOT NULL DEFAULT 0,
  total_images INT NOT NULL DEFAULT 0,
  supplier_images INT NOT NULL DEFAULT 0,
  ai_lifestyle_images INT NOT NULL DEFAULT 0,
  cloudinary_images INT NOT NULL DEFAULT 0,
  rehosted_images INT NOT NULL DEFAULT 0,
  missing_lifestyle BOOLEAN NOT NULL DEFAULT true,
  margin_percent NUMERIC,
  pinterest_clicks_30d INT DEFAULT 0,
  product_views_30d INT DEFAULT 0,
  pinterest_tier_score NUMERIC,
  traffic_rank NUMERIC,
  margin_rank NUMERIC,
  pinterest_rank NUMERIC,
  composite_score NUMERIC NOT NULL DEFAULT 0,
  priority INT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_regeneration_queue TO authenticated;
GRANT ALL ON public.pinterest_regeneration_queue TO service_role;
ALTER TABLE public.pinterest_regeneration_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regen_queue_admin_all"
  ON public.pinterest_regeneration_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_regen_queue_priority ON public.pinterest_regeneration_queue(priority);
CREATE INDEX IF NOT EXISTS idx_regen_queue_status ON public.pinterest_regeneration_queue(status);

WITH lp AS (
  SELECT product_id,
         COUNT(*) AS legacy_pin_count,
         COUNT(*) FILTER (WHERE pinterest_pin_id IS NOT NULL) AS legacy_live_count
  FROM public.pinterest_pin_queue
  WHERE legacy_supplier_content=true AND product_id IS NOT NULL
  GROUP BY product_id
),
img AS (
  SELECT p.id AS product_id,
    COALESCE(array_length(p.images,1),0) AS total_images,
    (SELECT COUNT(*) FROM unnest(p.images) u WHERE u ILIKE ANY(ARRAY['%cjdropshipping%','%alicdn%','%aliexpress%','%alibaba%','%1688%','%dhgate%'])) AS supplier_images,
    (SELECT COUNT(*) FROM unnest(p.images) u WHERE u ILIKE '%cloudinary%') AS cloudinary_images,
    (SELECT COUNT(*) FROM unnest(p.images) u WHERE u ILIKE '%supabase.co/storage%/rehosted%') AS rehosted_images,
    (SELECT COUNT(*) FROM unnest(p.images) u WHERE u ILIKE '%/lifestyle/%' OR u ILIKE '%/ai/%') AS ai_lifestyle_images
  FROM public.products p
),
traffic AS (
  SELECT product_id::uuid AS product_id,
         COALESCE(SUM(pinterest_clicks),0)::int AS pin_clicks,
         COALESCE(SUM(views),0)::int AS views
  FROM public.pinterest_pdp_conversion_stats
  WHERE day >= (current_date - interval '30 days') AND product_id IS NOT NULL AND product_id ~ '^[0-9a-f-]{36}$'
  GROUP BY product_id
),
tier AS (
  SELECT product_id, MAX(score) AS pinterest_score
  FROM public.pinterest_revenue_product_tiers
  GROUP BY product_id
),
base AS (
  SELECT lp.product_id,
         p.slug, p.name,
         lp.legacy_pin_count, lp.legacy_live_count,
         COALESCE(img.total_images,0) total_images,
         COALESCE(img.supplier_images,0) supplier_images,
         COALESCE(img.ai_lifestyle_images,0) ai_lifestyle_images,
         COALESCE(img.cloudinary_images,0) cloudinary_images,
         COALESCE(img.rehosted_images,0) rehosted_images,
         (COALESCE(img.ai_lifestyle_images,0) + COALESCE(img.cloudinary_images,0)) = 0 AS missing_lifestyle,
         p.margin_percent,
         COALESCE(t.pin_clicks,0) AS pin_clicks,
         COALESCE(t.views,0) AS views,
         COALESCE(tier.pinterest_score,0) AS pinterest_score
  FROM lp
  JOIN public.products p ON p.id=lp.product_id
  LEFT JOIN img ON img.product_id=lp.product_id
  LEFT JOIN traffic t ON t.product_id=lp.product_id
  LEFT JOIN tier ON tier.product_id=lp.product_id
),
ranked AS (
  SELECT *,
    PERCENT_RANK() OVER (ORDER BY (pin_clicks*2 + views)) AS traffic_rank,
    PERCENT_RANK() OVER (ORDER BY COALESCE(margin_percent,0)) AS margin_rank,
    PERCENT_RANK() OVER (ORDER BY pinterest_score) AS pinterest_rank
  FROM base
),
scored AS (
  SELECT *, (0.45*traffic_rank + 0.30*margin_rank + 0.25*pinterest_rank) AS composite_score
  FROM ranked
)
INSERT INTO public.pinterest_regeneration_queue (
  product_id, product_slug, product_name,
  legacy_pin_count, legacy_live_count,
  total_images, supplier_images, ai_lifestyle_images, cloudinary_images, rehosted_images,
  missing_lifestyle, margin_percent, pinterest_clicks_30d, product_views_30d,
  pinterest_tier_score, traffic_rank, margin_rank, pinterest_rank,
  composite_score, priority
)
SELECT
  product_id, slug, name,
  legacy_pin_count, legacy_live_count,
  total_images, supplier_images, ai_lifestyle_images, cloudinary_images, rehosted_images,
  missing_lifestyle, margin_percent, pin_clicks, views,
  pinterest_score, traffic_rank, margin_rank, pinterest_rank,
  composite_score,
  ROW_NUMBER() OVER (ORDER BY composite_score DESC)
FROM scored
ON CONFLICT (product_id) DO UPDATE SET
  legacy_pin_count=EXCLUDED.legacy_pin_count,
  legacy_live_count=EXCLUDED.legacy_live_count,
  total_images=EXCLUDED.total_images,
  supplier_images=EXCLUDED.supplier_images,
  ai_lifestyle_images=EXCLUDED.ai_lifestyle_images,
  cloudinary_images=EXCLUDED.cloudinary_images,
  rehosted_images=EXCLUDED.rehosted_images,
  missing_lifestyle=EXCLUDED.missing_lifestyle,
  margin_percent=EXCLUDED.margin_percent,
  pinterest_clicks_30d=EXCLUDED.pinterest_clicks_30d,
  product_views_30d=EXCLUDED.product_views_30d,
  pinterest_tier_score=EXCLUDED.pinterest_tier_score,
  traffic_rank=EXCLUDED.traffic_rank,
  margin_rank=EXCLUDED.margin_rank,
  pinterest_rank=EXCLUDED.pinterest_rank,
  composite_score=EXCLUDED.composite_score,
  priority=EXCLUDED.priority,
  updated_at=now();
