
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_hash text,
  ADD COLUMN IF NOT EXISTS overlay_text text[];

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_media_hash
  ON public.cinematic_ad_jobs(media_hash) WHERE media_hash IS NOT NULL;

ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS allow_static_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_pins_per_day integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS min_publish_gap_minutes integer NOT NULL DEFAULT 75;

CREATE TABLE IF NOT EXISTS public.pinterest_category_rotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL UNIQUE,
  category text,
  last_published_at timestamptz,
  publish_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pinterest_category_rotation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage rotation" ON public.pinterest_category_rotation;
CREATE POLICY "Admins manage rotation" ON public.pinterest_category_rotation
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_rotation_last_pub
  ON public.pinterest_category_rotation(last_published_at);

CREATE OR REPLACE VIEW public.pinterest_product_cooldown_v
WITH (security_invoker = true) AS
SELECT
  product_slug,
  MAX(pushed_to_pinterest_at) AS last_pushed_at,
  COUNT(*) FILTER (WHERE pushed_to_pinterest_at > now() - interval '30 days') AS pushes_last_30d,
  COUNT(*) FILTER (WHERE media_type = 'video'     AND pushed_to_pinterest_at > now() - interval '7 days') AS videos_last_7d,
  COUNT(*) FILTER (WHERE media_type = 'slideshow' AND pushed_to_pinterest_at > now() - interval '7 days') AS slideshows_last_7d,
  COUNT(*) FILTER (WHERE media_type = 'static'    AND pushed_to_pinterest_at > now() - interval '7 days') AS statics_last_7d
FROM public.cinematic_ad_jobs
WHERE pushed_to_pinterest_at IS NOT NULL
GROUP BY product_slug;

CREATE TABLE IF NOT EXISTS public.pinterest_creative_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_type text NOT NULL CHECK (pool_type IN ('overlay_short','cta_us','hook_archetype','hashtag_us')),
  value text NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_type, value)
);
ALTER TABLE public.pinterest_creative_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage creative pools" ON public.pinterest_creative_pools;
CREATE POLICY "Admins manage creative pools" ON public.pinterest_creative_pools
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service role reads creative pools" ON public.pinterest_creative_pools;
CREATE POLICY "Service role reads creative pools" ON public.pinterest_creative_pools
  FOR SELECT TO service_role USING (true);

INSERT INTO public.pinterest_creative_pools (pool_type, value)
SELECT 'overlay_short', v FROM unnest(ARRAY[
  'No more litter smell','Cats actually love this','Worth every penny',
  'Self-cleaning = game changer','Best upgrade for cat parents',
  'My cat is obsessed','I wish I bought this sooner',
  'Goodbye scooping forever','POV: clean home, happy cat','Cat parents need this'
]) v ON CONFLICT DO NOTHING;

INSERT INTO public.pinterest_creative_pools (pool_type, value)
SELECT 'cta_us', v FROM unnest(ARRAY[
  'Tap to see it in action','See why cat parents love it','Try it risk-free',
  'See the reviews','Get yours today'
]) v ON CONFLICT DO NOTHING;

INSERT INTO public.pinterest_creative_pools (pool_type, value)
SELECT 'hook_archetype', v FROM unnest(ARRAY[
  'problem_solution','cat_reaction','before_after','smart_home',
  'pet_parent_relief','viral_tiktok','pov','wish_sooner'
]) v ON CONFLICT DO NOTHING;

INSERT INTO public.pinterest_creative_pools (pool_type, value)
SELECT 'hashtag_us', v FROM unnest(ARRAY[
  '#catsofusa','#catparents','#smartpetgear','#cleanhome','#catlife',
  '#petgadgets','#litterboxhack','#catsoftiktok','#petparenthood'
]) v ON CONFLICT DO NOTHING;
