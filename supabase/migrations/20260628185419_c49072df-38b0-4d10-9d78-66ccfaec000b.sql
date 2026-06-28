
-- ============================================================
-- PCIE-V2 Foundation Schema
-- All catalog tables are data-driven; business logic reads them dynamically.
-- ============================================================

-- generic catalog tables
CREATE TABLE public.pcie_v2_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pcie_v2_feature_flags (
  flag TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INT NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pcie_v2_style_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  family_group TEXT,
  prompt_fragment TEXT NOT NULL,
  negative_fragment TEXT,
  traits JSONB NOT NULL DEFAULT '{}',
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pcie_v2_typography_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  font_stack JSONB NOT NULL DEFAULT '[]',
  treatment TEXT,
  prompt_fragment TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_hook_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pattern TEXT,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.pcie_v2_hook_categories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  niche_tags TEXT[] NOT NULL DEFAULT '{}',
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT DEFAULT 'seed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcie_v2_hooks_cat ON public.pcie_v2_hooks(category_id) WHERE enabled;

CREATE TABLE public.pcie_v2_camera_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_emotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  intensity NUMERIC NOT NULL DEFAULT 0.5,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_cta_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  text_template TEXT NOT NULL,
  prompt_fragment TEXT,
  verb_class TEXT,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_scene_generators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  applies_to JSONB NOT NULL DEFAULT '{}', -- e.g. {"niches":["cat_tree"]}
  weight NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_scoring_axes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  evaluator TEXT NOT NULL, -- handler key consumed by the edge fn
  weight NUMERIC NOT NULL DEFAULT 1.0,
  min_score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 100,
  pass_threshold NUMERIC NOT NULL DEFAULT 70,
  hard_reject BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_performance_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'higher_better',
  weight NUMERIC NOT NULL DEFAULT 1.0,
  source TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.pcie_v2_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  handler TEXT NOT NULL,
  order_index INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'
);

-- runs + creatives
CREATE TABLE public.pcie_v2_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT,
  requested INT NOT NULL DEFAULT 0,
  produced INT NOT NULL DEFAULT 0,
  rejected INT NOT NULL DEFAULT 0,
  duplicates INT NOT NULL DEFAULT 0,
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE public.pcie_v2_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pcie_v2_runs(id) ON DELETE SET NULL,
  product_id UUID,
  product_slug TEXT,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|published|rejected
  reject_reason TEXT,
  image_url TEXT,
  prompt TEXT,
  negative_prompt TEXT,
  prompt_version TEXT,
  model TEXT,
  seed BIGINT,
  fingerprint TEXT,
  novelty_total NUMERIC,
  pass_publish_gate BOOLEAN NOT NULL DEFAULT false,
  decisions JSONB NOT NULL DEFAULT '{}', -- snapshot of all attribute choices
  scores JSONB NOT NULL DEFAULT '{}',     -- snapshot of axis scores
  pipeline_trace JSONB NOT NULL DEFAULT '[]',
  pinterest_pin_id TEXT,
  pinterest_queue_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcie_v2_creatives_status ON public.pcie_v2_creatives(status, created_at DESC);
CREATE INDEX idx_pcie_v2_creatives_fp ON public.pcie_v2_creatives(fingerprint);

-- one row per attribute decision, fully normalized for learning
CREATE TABLE public.pcie_v2_creative_decisions (
  id BIGSERIAL PRIMARY KEY,
  creative_id UUID NOT NULL REFERENCES public.pcie_v2_creatives(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,   -- e.g. "style_family","camera","emotion"
  value_slug TEXT NOT NULL,
  value_id UUID,
  weight_used NUMERIC,
  source TEXT,               -- "random","weighted","forced","experiment"
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_pcie_v2_decisions_attr ON public.pcie_v2_creative_decisions(attribute, value_slug);
CREATE INDEX idx_pcie_v2_decisions_creative ON public.pcie_v2_creative_decisions(creative_id);

CREATE TABLE public.pcie_v2_novelty_scores (
  id BIGSERIAL PRIMARY KEY,
  creative_id UUID NOT NULL REFERENCES public.pcie_v2_creatives(id) ON DELETE CASCADE,
  axis_slug TEXT NOT NULL,
  score NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_pcie_v2_novelty_creative ON public.pcie_v2_novelty_scores(creative_id);

CREATE TABLE public.pcie_v2_combo_fingerprints (
  fingerprint TEXT PRIMARY KEY,
  creative_id UUID,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcie_v2_fp_seen ON public.pcie_v2_combo_fingerprints(seen_at DESC);

-- full event ledger for accept/reject/regenerate/score
CREATE TABLE public.pcie_v2_events (
  id BIGSERIAL PRIMARY KEY,
  creative_id UUID,
  run_id UUID,
  stage TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcie_v2_events_creative ON public.pcie_v2_events(creative_id);
CREATE INDEX idx_pcie_v2_events_time ON public.pcie_v2_events(created_at DESC);

-- genetic evolution weights: per attribute value per performance signal
CREATE TABLE public.pcie_v2_attribute_weights (
  id BIGSERIAL PRIMARY KEY,
  attribute TEXT NOT NULL,
  value_slug TEXT NOT NULL,
  signal_slug TEXT NOT NULL,
  observations INT NOT NULL DEFAULT 0,
  ema_value NUMERIC NOT NULL DEFAULT 0,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  confidence NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attribute, value_slug, signal_slug)
);
CREATE INDEX idx_pcie_v2_attr_weights ON public.pcie_v2_attribute_weights(attribute, value_slug);

-- ============================================================
-- GRANTS + RLS (admin reads, service-role writes)
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pcie_v2_config','pcie_v2_feature_flags','pcie_v2_style_families','pcie_v2_typography_systems',
    'pcie_v2_hook_categories','pcie_v2_hooks','pcie_v2_camera_presets','pcie_v2_emotions',
    'pcie_v2_cta_styles','pcie_v2_scene_generators','pcie_v2_scoring_axes','pcie_v2_performance_signals',
    'pcie_v2_pipeline_stages','pcie_v2_runs','pcie_v2_creatives','pcie_v2_creative_decisions',
    'pcie_v2_novelty_scores','pcie_v2_combo_fingerprints','pcie_v2_events','pcie_v2_attribute_weights'
  ])
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY "admins read %I" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(),''admin''::app_role));', t, t);
    EXECUTE format('CREATE POLICY "service write %I" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;

-- sequence grants
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Feature flags
INSERT INTO public.pcie_v2_feature_flags(flag, enabled, notes) VALUES
  ('pcie_v2_enabled', true, 'Master switch for PCIE V2 creative director'),
  ('pcie_v2_self_critique', true, 'Run LLM self-critique stage'),
  ('pcie_v2_publish_gate', true, 'Hard gate on novelty>=threshold'),
  ('pcie_v2_genetic_learning', true, 'Update attribute weights from performance'),
  ('pcie_v2_replace_legacy', false, 'Route legacy creative-factory calls to v2');

-- Global config
INSERT INTO public.pcie_v2_config(key, value, description) VALUES
  ('publish_gate_threshold', '95'::jsonb, 'Min novelty_total to publish'),
  ('max_attempts_per_creative', '3'::jsonb, 'Regeneration ceiling'),
  ('dedupe_window_size', '300'::jsonb, 'Rolling fingerprint window'),
  ('similarity_max_pct', '35'::jsonb, 'Max combo similarity allowed'),
  ('default_image_model', '"google/gemini-3-pro-image-preview"'::jsonb, 'Default image model'),
  ('default_text_model', '"google/gemini-3-flash-preview"'::jsonb, 'Default text/critique model');

-- Pipeline stages
INSERT INTO public.pcie_v2_pipeline_stages(slug,name,handler,order_index,config) VALUES
  ('product_context','Product Context','product_context',10,'{}'),
  ('story','Story Engine','story',20,'{}'),
  ('style','Style Engine','style',30,'{}'),
  ('emotion','Emotion Engine','emotion',40,'{}'),
  ('typography','Typography Engine','typography',50,'{}'),
  ('hook','Hook Engine','hook',60,'{}'),
  ('composition','Composition Engine','composition',70,'{}'),
  ('camera','Camera Engine','camera',75,'{}'),
  ('cta','CTA Engine','cta',80,'{}'),
  ('qa','QA Engine','qa',90,'{}'),
  ('self_critique','Self Critique','self_critique',95,'{}'),
  ('publish','Publishing','publish',100,'{}');

-- Scoring axes (9 to start, fully extensible)
INSERT INTO public.pcie_v2_scoring_axes(slug,name,description,evaluator,weight,pass_threshold,hard_reject) VALUES
  ('scroll_interruption','Scroll Interruption','Does this stop the thumb?','llm_visual',1.5,70,false),
  ('curiosity_gap','Curiosity Gap','Does it open a loop?','llm_text',1.2,65,false),
  ('product_clarity','Product Clarity','Hero product instantly identifiable','llm_visual',1.3,70,true),
  ('composition_strength','Composition','Pinterest-native vertical balance','llm_visual',1.0,65,false),
  ('typography_quality','Typography','Hierarchy + legibility','llm_visual',1.0,60,false),
  ('emotion_resonance','Emotional Resonance','Triggers a feeling','llm_visual',1.0,60,false),
  ('scene_realism','Scene Realism','No AI artifacts','llm_visual',1.2,70,true),
  ('hook_strength','Hook Strength','Headline curiosity + specificity','heuristic',1.1,65,false),
  ('novelty_vs_recent','Novelty vs Recent','Diff from last 300 fingerprints','combo_diversity',1.4,60,true);

-- Performance signals (full funnel, extensible)
INSERT INTO public.pcie_v2_performance_signals(slug,name,direction,weight,source) VALUES
  ('ctr','Click Through Rate','higher_better',1.5,'pinterest'),
  ('saves','Saves','higher_better',1.0,'pinterest'),
  ('outbound_clicks','Outbound Clicks','higher_better',1.4,'pinterest'),
  ('add_to_cart','Add To Cart','higher_better',1.6,'ga4'),
  ('checkout_started','Checkout Started','higher_better',1.7,'ga4'),
  ('purchase','Purchase','higher_better',2.0,'ga4'),
  ('revenue','Revenue','higher_better',2.5,'stripe'),
  ('roas','ROAS','higher_better',2.0,'derived'),
  ('time_on_page','Time on Page','higher_better',0.6,'ga4'),
  ('bounce_rate','Bounce Rate','lower_better',0.8,'ga4'),
  ('pin_engagement','Pinterest Engagement','higher_better',1.0,'pinterest'),
  ('pdp_scroll_depth','PDP Scroll Depth','higher_better',0.6,'ga4');

-- 40 style families
INSERT INTO public.pcie_v2_style_families(slug,name,family_group,prompt_fragment) VALUES
  ('editorial_minimal','Editorial Minimal','editorial','editorial magazine layout, generous negative space, single hero focus'),
  ('apple_clean','Apple Clean','editorial','crisp white seamless, single key light, hyper-clean product hero'),
  ('patagonia_outdoor','Patagonia Outdoor','lifestyle','rugged outdoor scene, golden hour, documentary feel'),
  ('airbnb_warm_home','Airbnb Warm Home','lifestyle','warm lived-in interior, soft window light, real home textures'),
  ('ikea_lifestyle','IKEA Lifestyle','lifestyle','bright Scandinavian interior, light wood, practical staging'),
  ('nike_kinetic','Nike Kinetic','dynamic','high-energy motion blur, bold diagonal composition'),
  ('pinterest_pastel','Pinterest Pastel','soft','dreamy pastel palette, soft gradients, feminine warmth'),
  ('cinematic_film','Cinematic Film','dramatic','35mm cinematic grade, shallow depth, anamorphic flare'),
  ('flat_lay_overhead','Flat Lay Overhead','editorial','top-down overhead flat lay, geometric arrangement'),
  ('split_screen_before_after','Split Screen','informational','vertical split before/after composition'),
  ('macro_detail','Macro Detail','dramatic','extreme macro of texture/material, razor focus'),
  ('handheld_pov','Handheld POV','ugc','first-person handheld POV, natural micro-shake'),
  ('shelfie_styled','Styled Shelfie','editorial','curated shelf still life, layered objects'),
  ('catalog_clean','Clean Catalog','editorial','soft seamless backdrop, premium catalog hero'),
  ('moodboard_collage','Moodboard Collage','editorial','torn-paper collage, mixed media, designer moodboard'),
  ('product_hero_studio','Studio Hero','editorial','seamless studio backdrop, three-point lighting'),
  ('lifestyle_pet_owner','Pet + Owner Lifestyle','lifestyle','authentic candid pet+owner moment, real home'),
  ('lifestyle_pet_alone','Pet Solo Lifestyle','lifestyle','pet using product, room context, real home lighting'),
  ('luxury_lifestyle','Luxury Lifestyle','lifestyle','premium interior, designer aesthetic, refined palette'),
  ('rustic_farmhouse','Rustic Farmhouse','lifestyle','warm farmhouse, natural wood, cozy textiles'),
  ('modern_minimal_home','Modern Minimal Home','lifestyle','modern minimal interior, neutral palette, considered staging'),
  ('infographic_data','Infographic Data','informational','clean infographic with key spec callouts'),
  ('listicle_grid','Listicle Grid','informational','numbered grid layout with mini-cards'),
  ('quote_card','Quote Card','informational','bold quote-card typography, secondary product inset'),
  ('checklist_card','Checklist Card','informational','vertical checklist with product proof'),
  ('seasonal_holiday','Seasonal Holiday','seasonal','holiday styling cues, seasonal palette'),
  ('summer_outdoor','Summer Outdoor','seasonal','sun-soaked outdoor, vibrant warm palette'),
  ('cozy_winter','Cozy Winter','seasonal','warm interior, throws, low warm light'),
  ('spring_fresh','Spring Fresh','seasonal','airy bright spring palette, fresh florals'),
  ('autumn_warm','Autumn Warm','seasonal','autumnal palette, warm earthy tones'),
  ('vintage_70s','Vintage 70s','retro','warm 70s palette, grainy film stock'),
  ('y2k_pop','Y2K Pop','retro','glossy y2k aesthetic, chrome + pastel'),
  ('brutalist_typo','Brutalist Typography','editorial','heavy brutalist type, raw asymmetric grid'),
  ('swiss_grid','Swiss Grid','editorial','strict swiss grid, helvetica-style hierarchy'),
  ('storybook_illustrated','Storybook Illustrated','illustrated','soft illustrated storybook overlay on real photo'),
  ('documentary_real','Documentary Real','ugc','documentary still, real moment, no styling'),
  ('catalog_grid_3','3-Up Catalog Grid','editorial','three product variants in vertical grid'),
  ('contrast_pop','High-Contrast Pop','dramatic','high-contrast saturated palette, pop-art energy'),
  ('soft_dreamy','Soft Dreamy','soft','low-contrast dreamy haze, lifted blacks'),
  ('night_mood','Night Mood','dramatic','low-key night scene, practical warm sources');

-- Typography systems (8 to seed; extensible to 100)
INSERT INTO public.pcie_v2_typography_systems(slug,name,prompt_fragment,font_stack,treatment) VALUES
  ('editorial_serif','Editorial Serif','large editorial serif headline, tight tracking','["Playfair","Canela"]','headline-serif'),
  ('bold_sans','Bold Sans','heavy modern sans, condensed','["Inter Black","Druk"]','headline-sans'),
  ('handwritten_accent','Handwritten Accent','script accent on noun, sans body','["Caveat","Inter"]','mixed'),
  ('brutalist_stack','Brutalist Stack','stacked all-caps brutalist','["Space Grotesk"]','stacked-caps'),
  ('magazine_kicker','Magazine Kicker','small kicker + big headline pair','["GT Sectra","Inter"]','kicker-pair'),
  ('rounded_friendly','Rounded Friendly','rounded soft sans','["Nunito","DM Sans"]','rounded'),
  ('mono_tech','Mono Tech','mono accent line + sans headline','["JetBrains Mono","Inter"]','mono-accent'),
  ('display_serif_swash','Display Swash Serif','display serif with swash','["Canela","Lora"]','display-swash');

-- Hook categories (22)
INSERT INTO public.pcie_v2_hook_categories(slug,name,pattern) VALUES
  ('curiosity_gap','Curiosity Gap','open loop without revealing'),
  ('transformation','Transformation','before/after promise'),
  ('problem_solution','Problem Solution','name pain + fix'),
  ('social_proof','Social Proof','others bought/loved this'),
  ('specific_number','Specific Number','exact stat or count'),
  ('question_direct','Direct Question','ask the reader'),
  ('warning','Warning','do not / stop'),
  ('contrarian','Contrarian','reverse common wisdom'),
  ('aspiration','Aspiration','dream state'),
  ('time_savings','Time Savings','minutes/seconds saved'),
  ('money_savings','Money Savings','dollars/percent off'),
  ('confession','Confession','i used to / honestly'),
  ('list_format','Listicle','3/5/7 ways/things'),
  ('how_to','How To','quick how to'),
  ('mistake','Mistake','common mistake'),
  ('secret','Secret','insider tip'),
  ('comparison','Comparison','x vs y'),
  ('seasonal','Seasonal','tied to season/holiday'),
  ('urgency','Urgency','limited / ending'),
  ('identity','Identity','for [persona] who...'),
  ('story','Mini Story','tiny vignette'),
  ('command','Command','direct imperative');

-- Camera presets
INSERT INTO public.pcie_v2_camera_presets(slug,name,prompt_fragment) VALUES
  ('eye_level_50mm','Eye Level 50mm','eye-level 50mm equivalent, natural perspective'),
  ('low_angle_35mm','Low Angle 35mm','heroic low angle, 35mm wide'),
  ('overhead_flatlay','Overhead Flat Lay','perfect top-down 90deg overhead'),
  ('macro_100mm','Macro 100mm','100mm macro razor focus on detail'),
  ('handheld_pov','Handheld POV','handheld first-person POV'),
  ('over_shoulder','Over Shoulder','over-the-shoulder voyeur'),
  ('dutch_angle','Dutch Angle','dynamic dutch tilt'),
  ('product_3q','3/4 Product','classic 3/4 product angle'),
  ('symmetrical_center','Symmetrical Centered','dead-center symmetry'),
  ('wide_room','Wide Room','wide interior environment shot');

-- Emotions
INSERT INTO public.pcie_v2_emotions(slug,name,prompt_fragment,intensity) VALUES
  ('relief','Relief','relief, problem solved, calm exhale',0.6),
  ('joy','Joy','genuine joy, soft smile',0.7),
  ('curiosity','Curiosity','intrigued head-tilt, gaze locked',0.8),
  ('coziness','Coziness','warm cozy comfort',0.5),
  ('pride','Pride','proud owner moment',0.6),
  ('surprise','Surprise','small surprise reveal',0.7),
  ('aspiration','Aspiration','aspirational lifestyle calm',0.5),
  ('mischief','Mischief','playful mischief',0.6),
  ('trust','Trust','quiet trust between pet and owner',0.5),
  ('excitement','Excitement','high-energy excitement',0.8),
  ('serenity','Serenity','serene stillness',0.4),
  ('belonging','Belonging','sense of home and belonging',0.5);

-- CTA styles
INSERT INTO public.pcie_v2_cta_styles(slug,name,text_template,verb_class) VALUES
  ('shop_now','Shop Now','Shop the {product}','shop'),
  ('see_it','See It','See why owners love this','see'),
  ('try_it','Try It','Try it risk-free','try'),
  ('save_it','Save It','Save this for later','save'),
  ('learn_more','Learn More','Learn why it works','learn'),
  ('get_yours','Get Yours','Get yours today','get'),
  ('discover','Discover','Discover the difference','discover'),
  ('tap_to_shop','Tap to Shop','Tap to shop','tap');

-- Scene generators
INSERT INTO public.pcie_v2_scene_generators(slug,name,prompt_fragment,applies_to) VALUES
  ('living_room','Living Room','real lived-in living room, sofa, side table, soft window light','{}'),
  ('bedroom','Bedroom','warm bedroom, layered textiles','{}'),
  ('kitchen','Kitchen','bright kitchen, marble counter, morning light','{}'),
  ('hallway_entry','Hallway Entry','entryway, natural hardwood','{}'),
  ('sunny_window','Sunny Window','beam of window sun, dust motes','{}'),
  ('outdoor_yard','Outdoor Yard','sunny grass yard, garden bokeh','{"environment":"outdoor"}'),
  ('outdoor_porch','Outdoor Porch','wood porch, golden hour','{"environment":"outdoor"}'),
  ('studio_seamless','Studio Seamless','seamless studio backdrop','{}'),
  ('cozy_corner','Cozy Corner','pet cozy corner with throw','{}'),
  ('car_interior','Car Interior','clean car interior, daylight','{"niches":["dog_car"]}');

-- Hook seed (~24 per category = ~528 hooks, grows from production)
INSERT INTO public.pcie_v2_hooks(category_id, text, niche_tags)
SELECT c.id, hook.text, ARRAY[]::text[]
FROM public.pcie_v2_hook_categories c
JOIN LATERAL (
  VALUES
    ('curiosity_gap','The {niche} secret no one talks about'),
    ('curiosity_gap','I wish I knew this before buying a {niche}'),
    ('curiosity_gap','Why your {niche} keeps failing'),
    ('curiosity_gap','This tiny detail changes everything'),
    ('transformation','From chaos to calm in 7 days'),
    ('transformation','Before vs after: the {niche} reset'),
    ('transformation','Watch this {niche} go from messy to magazine'),
    ('problem_solution','Smelly {niche}? Fix it in one swap'),
    ('problem_solution','Stop the daily {niche} battle'),
    ('problem_solution','The fix nobody told us about'),
    ('social_proof','Why 12,000 pet parents switched'),
    ('social_proof','The {niche} every cat owner is buying'),
    ('specific_number','3 reasons this {niche} sells out'),
    ('specific_number','97% of cats prefer this in week one'),
    ('question_direct','Is your {niche} actually working?'),
    ('warning','Stop scooping. Read this first'),
    ('contrarian','Everyone is buying the wrong {niche}'),
    ('aspiration','Imagine a home that smells like nothing'),
    ('time_savings','15 seconds. No scooping. Done'),
    ('money_savings','Save $200 a year, no joke'),
    ('list_format','5 {niche} mistakes to skip'),
    ('how_to','How to pick a {niche} in 60 seconds'),
    ('secret','The secret behind quiet litter boxes'),
    ('seasonal','Holiday-ready home, paws and all')
) AS hook(cat_slug, text) ON hook.cat_slug = c.slug;

-- Style family attribute weights bootstrap (so genetic engine has rows)
INSERT INTO public.pcie_v2_attribute_weights(attribute,value_slug,signal_slug,weight)
SELECT 'style_family', sf.slug, ps.slug, 1.0
FROM public.pcie_v2_style_families sf
CROSS JOIN public.pcie_v2_performance_signals ps
ON CONFLICT DO NOTHING;
