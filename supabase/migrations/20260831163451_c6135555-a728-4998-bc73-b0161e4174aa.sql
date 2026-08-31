CREATE TABLE IF NOT EXISTS public.marketing_cohort_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key text NOT NULL,
  platform text NOT NULL DEFAULT 'pinterest',
  campaign text NOT NULL,
  pin_id text NOT NULL,
  utm_content text NOT NULL,
  destination_url text,
  published_at timestamptz,
  product_slug text,
  product_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_cohort_registry_platform_pin_uidx
  ON public.marketing_cohort_registry (platform, pin_id);
CREATE INDEX IF NOT EXISTS marketing_cohort_registry_cohort_idx
  ON public.marketing_cohort_registry (cohort_key);

GRANT SELECT ON public.marketing_cohort_registry TO authenticated;
GRANT ALL ON public.marketing_cohort_registry TO service_role;

ALTER TABLE public.marketing_cohort_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read cohort registry"
  ON public.marketing_cohort_registry
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.marketing_cohort_registry
  (cohort_key, platform, campaign, pin_id, utm_content, published_at, product_slug, notes)
VALUES
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860704','ufo-cat-tree','2026-08-25T06:34:58Z','ufo-cat-tree','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860708','cooling-dog-bed','2026-08-25T06:35:00Z','cooling-dog-bed','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860710','cat-water-fountain','2026-08-25T06:35:03Z','cat-water-fountain','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860711','auto-rolling-ball','2026-08-25T06:35:05Z','auto-rolling-ball','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860713','teaser-rolling-ball','2026-08-25T06:35:08Z','teaser-rolling-ball','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860714','catnip-fish-toy','2026-08-25T06:35:10Z','catnip-fish-toy','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860715','dog-collar','2026-08-25T06:35:12Z','dog-collar','seeded from verified T+72 audit'),
  ('homepage_product_push_2026-08-25','pinterest','homepage_product_push','1117103882604860718','cat-teaser-wand','2026-08-25T06:35:13Z','cat-teaser-wand','seeded from verified T+72 audit')
ON CONFLICT (platform, pin_id) DO NOTHING;