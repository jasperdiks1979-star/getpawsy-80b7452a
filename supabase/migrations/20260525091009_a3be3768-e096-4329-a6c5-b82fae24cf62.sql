-- 1. New columns on cinematic_ad_jobs
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS product_ids text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS scene_template text,
  ADD COLUMN IF NOT EXISTS predicted_engagement numeric;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_content_type
  ON public.cinematic_ad_jobs(content_type, created_at DESC)
  WHERE content_type IS NOT NULL;

-- 2. Archetype cooldown tracking
CREATE TABLE IF NOT EXISTS public.pinterest_archetype_cooldown (
  archetype text PRIMARY KEY,
  last_published_at timestamptz,
  cooldown_minutes integer NOT NULL DEFAULT 180,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_archetype_cooldown ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all pinterest_archetype_cooldown" ON public.pinterest_archetype_cooldown;
CREATE POLICY "admin all pinterest_archetype_cooldown"
  ON public.pinterest_archetype_cooldown
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Compilation themes
CREATE TABLE IF NOT EXISTS public.pinterest_compilation_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_template text NOT NULL,
  category text,
  min_products integer NOT NULL DEFAULT 3,
  max_products integer NOT NULL DEFAULT 5,
  cta text NOT NULL DEFAULT 'Shop these on GetPawsy',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_compilation_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all pinterest_compilation_themes" ON public.pinterest_compilation_themes;
CREATE POLICY "admin all pinterest_compilation_themes"
  ON public.pinterest_compilation_themes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Lifestyle scenes
CREATE TABLE IF NOT EXISTS public.pinterest_lifestyle_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_name text NOT NULL UNIQUE,
  backdrop_prompt text NOT NULL,
  overlay_hook text NOT NULL,
  music_mood text NOT NULL DEFAULT 'calm',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_lifestyle_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all pinterest_lifestyle_scenes" ON public.pinterest_lifestyle_scenes;
CREATE POLICY "admin all pinterest_lifestyle_scenes"
  ON public.pinterest_lifestyle_scenes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Seed compilation themes
INSERT INTO public.pinterest_compilation_themes (title_template, category, cta) VALUES
  ('{n} smart cat products worth buying', 'cat-trees', 'Tap to see all picks'),
  ('{n} pet gadgets cats secretly love', 'pet-gadgets', 'Save before they sell out'),
  ('{n} litter box upgrades every cat parent needs', 'litter-boxes', 'See the full list'),
  ('{n} grooming essentials for indoor cats', 'grooming', 'Shop on GetPawsy'),
  ('{n} feeders that make mornings easier', 'feeding', 'Browse all picks'),
  ('{n} smart pet products under $100', 'smart-products', 'See prices today'),
  ('{n} cat trees that match your apartment', 'cat-trees', 'Shop the collection'),
  ('{n} pet products that solved real problems', NULL, 'See all reviews'),
  ('I wish I bought these {n} pet items sooner', NULL, 'Tap to shop'),
  ('{n} viral cat products actually worth it', NULL, 'Check the full list')
ON CONFLICT DO NOTHING;

-- 6. Seed lifestyle scenes
INSERT INTO public.pinterest_lifestyle_scenes (scene_name, backdrop_prompt, overlay_hook, music_mood) VALUES
  ('cozy_morning', 'sunlit minimalist living room, soft cream tones, indoor plants, cozy throw blanket on linen sofa', 'mornings hit different with this', 'calm'),
  ('smart_home', 'modern scandi apartment, warm wood floor, smart pet feeder in soft focus, golden hour light', 'pet parents in 2026 be like', 'upbeat'),
  ('relaxing_evening', 'dimly lit bedroom with warm lamps, knit blanket, candle, cat tree silhouette', 'unwinding with my cat tonight', 'lofi'),
  ('rainy_day', 'window with raindrops, cozy reading nook, fleece throw, mug of tea', 'rainy day energy', 'lofi'),
  ('wfh_setup', 'minimalist desk with laptop, cat lounging on desk pad, warm afternoon light', 'WFH but make it cat-coded', 'upbeat'),
  ('sunday_reset', 'clean kitchen counter, fresh flowers, organized pet food station', 'sunday reset includes the cat', 'calm'),
  ('boho_loft', 'boho loft with hanging plants, woven textures, sunlight streaming in', 'home tour: cat edition', 'indie'),
  ('minimal_white', 'all-white minimalist space, sculptural cat tree, single sunbeam', 'less stuff, more cat', 'ambient')
ON CONFLICT (scene_name) DO NOTHING;

-- 7. Seed cooldown rows
INSERT INTO public.pinterest_archetype_cooldown (archetype, cooldown_minutes) VALUES
  ('product_spotlight', 90),
  ('multi_product_compilation', 360),
  ('lifestyle_scene', 480),
  ('ugc_pov', 240),
  ('animated_slideshow', 240)
ON CONFLICT (archetype) DO NOTHING;