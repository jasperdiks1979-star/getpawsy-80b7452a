
-- Phase 1: Pinterest congruency tables

CREATE TABLE IF NOT EXISTS public.pinterest_creative_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id UUID,
  product_id UUID,
  niche_key TEXT,
  hook_type TEXT,
  emotional_angle TEXT,
  visual_style TEXT,
  lifestyle_category TEXT,
  cta_style TEXT,
  color_palette JSONB DEFAULT '[]'::jsonb,
  audience_intent TEXT,
  landing_slug TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pci_pin_queue ON public.pinterest_creative_intents(pin_queue_id);
CREATE INDEX IF NOT EXISTS idx_pci_landing_slug ON public.pinterest_creative_intents(landing_slug);
CREATE INDEX IF NOT EXISTS idx_pci_product ON public.pinterest_creative_intents(product_id);

ALTER TABLE public.pinterest_creative_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage pinterest_creative_intents"
  ON public.pinterest_creative_intents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


CREATE TABLE IF NOT EXISTS public.pinterest_landing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  niche_key TEXT,
  hook_type TEXT,
  emotional_angle TEXT,
  hero_eyebrow TEXT,
  hero_headline TEXT NOT NULL,
  hero_subhead TEXT,
  cta_label TEXT NOT NULL DEFAULT 'See How It Works →',
  cta_tone TEXT DEFAULT 'calm',
  color_atmosphere TEXT DEFAULT 'cozy_neutral',
  lifestyle_image_keywords JSONB DEFAULT '[]'::jsonb,
  transformation_before TEXT,
  transformation_after TEXT,
  trust_block_variant TEXT DEFAULT 'premium',
  recommended_product_slug TEXT,
  recommended_collection_slug TEXT,
  body_blocks JSONB DEFAULT '[]'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plt_enabled ON public.pinterest_landing_templates(enabled);
CREATE INDEX IF NOT EXISTS idx_plt_niche ON public.pinterest_landing_templates(niche_key);

ALTER TABLE public.pinterest_landing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public reads enabled pinterest_landing_templates"
  ON public.pinterest_landing_templates FOR SELECT TO anon, authenticated
  USING (enabled = true);

CREATE POLICY "admins manage pinterest_landing_templates"
  ON public.pinterest_landing_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_plt_updated
  BEFORE UPDATE ON public.pinterest_landing_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed starter landings
INSERT INTO public.pinterest_landing_templates
  (slug, niche_key, hook_type, emotional_angle, hero_eyebrow, hero_headline, hero_subhead, cta_label, cta_tone, color_atmosphere, lifestyle_image_keywords, transformation_before, transformation_after, recommended_collection_slug)
VALUES
  ('litter-stress', 'cat_litter', 'problem', 'relief',
   'For cat parents who deserve better',
   'Stop the daily litter stress.',
   'A calmer routine for you, a cleaner space for your cat — without the constant scooping.',
   'See the cleaner way →', 'calm', 'cozy_neutral',
   '["modern bathroom","minimalist apartment","cozy cat owner interior"]'::jsonb,
   'Daily scooping, lingering odor, frustrated mornings.',
   'A self-cleaning routine that quietly handles itself.',
   'cat-litter-boxes'),

  ('calm-car-rides', 'dog_car', 'transformation', 'comfort',
   'For anxious pups on the move',
   'Calm car rides start with the right setup.',
   'Travel days your dog actually looks forward to — secure, soft, stress-free.',
   'Make car days easier →', 'calm', 'warm_travel',
   '["SUV interior","cozy roadtrip","golden hour pet travel"]'::jsonb,
   'Whining, sliding, anxious pacing in the back seat.',
   'A snug, secure spot they settle into within minutes.',
   'dog-car-seats'),

  ('cozy-cat-home', 'cat_tree', 'aspiration', 'pride',
   'A home cats love',
   'Build the cozy cat home you both deserve.',
   'Furniture-grade pieces that fit your space and finally make your cat feel at home.',
   'Shop the cozy upgrade →', 'calm', 'scandi_warm',
   '["scandinavian living room","sunlit reading nook","minimalist cat furniture"]'::jsonb,
   'Cluttered, mismatched cat gear that hides in corners.',
   'Pieces you actually want to keep in the living room.',
   'cat-trees'),

  ('no-more-fur', 'grooming', 'problem', 'control',
   'For shedding season survivors',
   'No more fur on every surface.',
   'A 5-minute grooming routine that quietly cuts shedding off at the source.',
   'See the routine →', 'calm', 'soft_morning',
   '["sunlit window grooming","cozy throw blanket","minimalist living room"]'::jsonb,
   'Fur on couches, beds, clothes — every single day.',
   'A quick weekly routine that keeps your home calm.',
   'pet-grooming'),

  ('calm-bedtime', 'calming_bed', 'transformation', 'safety',
   'For pets that never quite settle',
   'A calmer bedtime in 2 nights.',
   'Donut-soft, deep-walled beds designed to make anxious pets feel safe enough to actually sleep.',
   'See the calming bed →', 'calm', 'warm_bedroom',
   '["bedroom corner with throw","soft window light","cozy textured rug"]'::jsonb,
   'Restless pacing, scratching, looking for a safer spot.',
   'Curled up, breathing slow, asleep within minutes.',
   'pet-beds'),

  ('cat-owners-love-this', 'generic_pet', 'social_proof', 'belonging',
   'Loved by US cat parents',
   'The little upgrade thousands of cat parents quietly love.',
   'Small, smart pieces that make daily cat life noticeably easier — without the bulk.',
   'See what they chose →', 'calm', 'cozy_neutral',
   '["cozy cat owner interior","warm sunset window","minimalist apartment"]'::jsonb,
   NULL, NULL,
   'cat'),

  ('orthopedic-relief', 'dog_bed', 'problem', 'relief',
   'For dogs that deserve real rest',
   'The bed older dogs actually settle into.',
   'Memory-foam support engineered for joints — so the morning stiffness finally eases up.',
   'See the relief bed →', 'calm', 'warm_bedroom',
   '["sunlit living room corner","cozy throw blanket","wood floor minimalist"]'::jsonb,
   'Stiff mornings, restless circling, joint pain.',
   'Deep, settled sleep — and easier mornings.',
   'orthopedic-dog-beds'),

  ('fresh-water-everyday', 'cat_fountain', 'aspiration', 'care',
   'For pets that barely drink',
   'Fresh, moving water — every single day.',
   'A whisper-quiet fountain that finally gets your pet drinking enough.',
   'See the fountain →', 'calm', 'cool_clean',
   '["bright kitchen counter","modern minimalist sink","sunlit floor"]'::jsonb,
   'Dusty bowls, low water intake, kidney worries.',
   'Cool, filtered, flowing water on demand.',
   'pet-water-fountains'),

  ('boredom-fix', 'interactive_toy', 'transformation', 'joy',
   'For pets that need a brain workout',
   'The 10-minute boredom fix.',
   'Interactive toys that genuinely tire pets out — not the ones that get ignored after a day.',
   'See the boredom fix →', 'calm', 'soft_morning',
   '["bright living room play","wood floor toy scene","sunlit cozy interior"]'::jsonb,
   'Destructive chewing, restless pacing, ignored toys.',
   'Engaged play, tired pet, peaceful evenings.',
   'interactive-toys'),

  ('mealtime-made-easy', 'feeder', 'solution', 'simplicity',
   'For owners who need their mornings back',
   'Mealtime that runs itself.',
   'Programmable, portion-perfect feeders that quietly handle breakfast — even when you don''t.',
   'See the auto feeder →', 'calm', 'cool_clean',
   '["modern kitchen counter","minimalist tile floor","morning sunlight"]'::jsonb,
   'Rushed mornings, missed meals, guilty texts.',
   'Pet fed on time — every time, automatically.',
   'pet-feeders')
ON CONFLICT (slug) DO NOTHING;
