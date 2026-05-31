ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS min_closeups_v7 integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_lifestyle_v7 integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_product_demo_v7 integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS text_safe_zone_tolerance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_caption_density_v7 numeric NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS max_dense_caption_ratio_v7 numeric NOT NULL DEFAULT 0.34;