
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pinterest_creative_style_profiles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pinterest_creative_style_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  style_name TEXT NOT NULL,
  visual_direction TEXT NOT NULL,
  scene_prompt_template TEXT NOT NULL,
  negative_prompt TEXT NOT NULL DEFAULT '',
  overlay_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  allowed_pin_types TEXT[] NOT NULL DEFAULT ARRAY['lifestyle','problem_solution','listicle','product_showcase']::text[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_creative_style_profiles TO authenticated;
GRANT ALL ON public.pinterest_creative_style_profiles TO service_role;
ALTER TABLE public.pinterest_creative_style_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read style profiles" ON public.pinterest_creative_style_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service manages style profiles" ON public.pinterest_creative_style_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pinterest_pin_type_governor — rolling 30d counts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pinterest_pin_type_governor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  pin_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (window_start, pin_type)
);
GRANT SELECT ON public.pinterest_pin_type_governor TO authenticated;
GRANT ALL ON public.pinterest_pin_type_governor TO service_role;
ALTER TABLE public.pinterest_pin_type_governor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pin type gov" ON public.pinterest_pin_type_governor
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service manages pin type gov" ON public.pinterest_pin_type_governor
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pinterest_runtime_settings — new premium engine flags
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS premium_engine_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_legacy_product_feed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_type_target_ratio JSONB NOT NULL DEFAULT
    '{"lifestyle":0.70,"problem_solution":0.15,"listicle":0.10,"product_showcase":0.05}'::jsonb,
  ADD COLUMN IF NOT EXISTS premium_quality_threshold INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS non_dropshipping_min INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS pinterest_fit_min INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS lifestyle_min INTEGER NOT NULL DEFAULT 80;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pinterest_render_attempts — new score axes
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pinterest_render_attempts
  ADD COLUMN IF NOT EXISTS score_non_dropshipping INTEGER,
  ADD COLUMN IF NOT EXISTS score_pinterest_fit INTEGER,
  ADD COLUMN IF NOT EXISTS score_lifestyle INTEGER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed 11 style profiles
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.pinterest_creative_style_profiles
  (category, style_name, visual_direction, scene_prompt_template, negative_prompt, allowed_pin_types)
VALUES
  ('cat_litter', 'Calm Modern Apartment',
   'Clean modern home, hidden litter solution, fresh aesthetic, soft natural light, cat walking calmly nearby.',
   'A serene corner of a clean modern US apartment with soft morning light. {product} blends elegantly into the space. A relaxed cat walks calmly nearby on warm wood floors. Editorial Pinterest photography, 9:16, premium pet brand aesthetic, no text on image.',
   'no white background, no cutout product, no infographic, no stop scooping text, no overlay dumped on product, no marketplace look, no AliExpress, no CJ dropshipping, no German text, no fake badges.',
   ARRAY['lifestyle','problem_solution','listicle','product_showcase']::text[]),
  ('cat_trees', 'Scandinavian Living Room',
   'Beautiful Scandinavian or Japandi living room, warm natural light, cat lounging or climbing, furniture blends into decor.',
   'A bright Scandinavian living room with warm sunlight, plants, and a relaxed cat lounging on {product}. The cat tree blends naturally with the home decor. Editorial Pinterest photography, 9:16, premium pet brand, no text on image.',
   'no white background, no plain cutout, no collage, no marketplace product card, no AliExpress, no CJ.',
   ARRAY['lifestyle','listicle','product_showcase']::text[]),
  ('cat_furniture', 'Japandi Cat Corner',
   'Refined Japandi cat corner with restrained palette, generous negative space, premium materials.',
   'A quietly upscale Japandi corner with {product} as a refined design piece, a content cat resting nearby. Editorial Pinterest pin, 9:16, premium aesthetic.',
   'no supplier cutout, no template look, no overlay on product.',
   ARRAY['lifestyle','listicle']::text[]),
  ('dog_beds', 'Cozy Senior Dog Rest',
   'Cozy home, senior dog resting, warm blankets, calm premium scene, soft late afternoon light.',
   'A cozy living room with a senior dog peacefully resting on {product}, warm blankets, golden hour light through window. Editorial Pinterest photography, 9:16, premium pet brand.',
   'no flat product-only image, no white background, no marketplace look.',
   ARRAY['lifestyle','problem_solution']::text[]),
  ('dog_carriers', 'Stylish Travel Moment',
   'Stylish travel scene, car interior or airport, pet comfort and safety.',
   'A stylish pet parent with {product} during a calm travel moment — car interior or airport lounge, soft natural light, dog looking comfortable inside. Editorial Pinterest 9:16, premium.',
   'no technical catalog image, no white background.',
   ARRAY['lifestyle','problem_solution']::text[]),
  ('pet_travel', 'On The Road Aesthetic',
   'Aspirational travel moment with pet, premium car or hotel scene.',
   'A premium travel scene with a happy pet using {product}, soft cinematic light, aspirational lifestyle. Editorial Pinterest 9:16.',
   'no catalog image, no white background.',
   ARRAY['lifestyle']::text[]),
  ('cat_essentials', 'Quiet Home Detail',
   'Quiet upscale home detail shot, {product} integrated into a warm living scene with a cat.',
   'A quiet upscale home detail with {product} naturally integrated, a calm cat in soft light. Editorial Pinterest 9:16, premium aesthetic.',
   'no white background, no supplier cutout.',
   ARRAY['lifestyle','listicle']::text[]),
  ('toys', 'Joyful Play Moment',
   'Joyful indoor play moment between pet and owner, warm window light, candid energy.',
   'A candid joyful moment with a pet engaged with {product} in a warm home setting, soft natural light. Editorial Pinterest 9:16.',
   'no white background, no toy cutout, no marketplace look.',
   ARRAY['lifestyle','listicle']::text[]),
  ('feeding', 'Clean Kitchen Routine',
   'Clean kitchen, healthy pet routine, premium countertop or floor scene.',
   'A clean modern kitchen scene with {product} in use, a pet eating calmly, soft daylight, premium tones. Editorial Pinterest 9:16.',
   'no bowl-only white background, no catalog image.',
   ARRAY['lifestyle','problem_solution']::text[]),
  ('grooming', 'Spa-Like Care',
   'Spa-like grooming moment, warm bathroom or grooming corner, calm pet, soft towels.',
   'A spa-like grooming corner with {product}, calm pet being groomed, warm soft towels, gentle light. Editorial Pinterest 9:16.',
   'no white background, no catalog image.',
   ARRAY['lifestyle','problem_solution']::text[]),
  ('general_pet_supplies', 'Pet Lifestyle Home',
   'Warm pet lifestyle home scene, {product} blending into the room.',
   'A warm lifestyle home scene with {product} blending naturally into the decor, calm pet in frame, soft daylight. Editorial Pinterest 9:16, premium pet brand.',
   'no white background, no cutout, no marketplace look.',
   ARRAY['lifestyle','listicle']::text[])
ON CONFLICT (category) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Mass-reject legacy queued/draft pins (≤30d) lacking premium creative tag
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.pinterest_pin_queue
SET status = 'rejected',
    error_message = 'rejected_low_quality_supplier_style',
    updated_at = now()
WHERE status IN ('queued','draft')
  AND created_at >= now() - INTERVAL '30 days'
  AND COALESCE(meta->>'creative_source','') <> 'creative_director_v2';
