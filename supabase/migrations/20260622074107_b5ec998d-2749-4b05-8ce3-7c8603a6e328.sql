
CREATE TABLE IF NOT EXISTS public.cinematic_scene_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  scene_group text NOT NULL,
  allowed_species text[] NOT NULL DEFAULT ARRAY['cat','dog','other']::text[],
  allowed_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  prompt_snippet text NOT NULL,
  mood text,
  seasonal boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  weight numeric NOT NULL DEFAULT 1.0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cinematic_scene_environments TO authenticated;
GRANT ALL ON public.cinematic_scene_environments TO service_role;
ALTER TABLE public.cinematic_scene_environments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read scenes" ON public.cinematic_scene_environments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service role manages scenes" ON public.cinematic_scene_environments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.cinematic_voice_rotation_state (
  category text PRIMARY KEY,
  last_voice text,
  consecutive_count int NOT NULL DEFAULT 0,
  recent_voices jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cinematic_voice_rotation_state TO authenticated;
GRANT ALL ON public.cinematic_voice_rotation_state TO service_role;
ALTER TABLE public.cinematic_voice_rotation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read voice state" ON public.cinematic_voice_rotation_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service role manages voice state" ON public.cinematic_voice_rotation_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.cinematic_product_match_qa_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid,
  product_id uuid,
  product_slug text,
  reject_score int NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  script_match_score int,
  voiceover_match_score int,
  scene_match_score int,
  caption_match_score int,
  passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cinematic_product_match_qa_log TO authenticated;
GRANT ALL ON public.cinematic_product_match_qa_log TO service_role;
ALTER TABLE public.cinematic_product_match_qa_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read qa log" ON public.cinematic_product_match_qa_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service role manages qa log" ON public.cinematic_product_match_qa_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_qa_log_asset ON public.cinematic_product_match_qa_log(asset_id, created_at DESC);

INSERT INTO public.cinematic_scene_environments (slug, display_name, scene_group, allowed_species, prompt_snippet, mood, seasonal) VALUES
('modern_home_livingroom','Modern Home Living Room','modern_home',ARRAY['cat','dog','other'],'bright minimal living room, oak floor, neutral linen sofa, soft window light','calm',false),
('modern_home_kitchen','Modern Home Kitchen','modern_home',ARRAY['cat','dog','other'],'clean white kitchen, marble counter, morning sun, plants on shelf','fresh',false),
('modern_home_office','Modern Home Office','modern_home',ARRAY['cat','dog','other'],'sleek home office, wooden desk, soft daylight, indoor plants','focused',false),
('modern_home_entryway','Modern Home Entryway','modern_home',ARRAY['cat','dog','other'],'modern entryway, light wood floor, hanging coats, ambient daylight','welcoming',false),
('luxury_home_lounge','Luxury Home Lounge','luxury_home',ARRAY['cat','dog','other'],'editorial luxury lounge, velvet sofa, brass accents, warm tungsten light','premium',false),
('luxury_home_library','Luxury Home Library','luxury_home',ARRAY['cat','dog','other'],'wood-paneled library, leather chair, brass lamp, golden hour glow','sophisticated',false),
('luxury_home_diningroom','Luxury Dining Room','luxury_home',ARRAY['cat','dog','other'],'editorial dining room, candle light, dark walls, brass chandelier','elegant',false),
('outdoor_garden','Outdoor Garden','outdoor',ARRAY['cat','dog','other'],'sun-dappled backyard garden, green grass, soft bokeh foliage','natural',false),
('outdoor_patio','Outdoor Patio','outdoor',ARRAY['cat','dog','other'],'wooden patio, woven rug, string lights, golden hour','relaxed',false),
('outdoor_front_porch','Front Porch','outdoor',ARRAY['dog','other'],'wooden front porch, hanging plants, late afternoon sun','homely',false),
('park_open_field','Park Open Field','park',ARRAY['dog'],'wide green park, distant trees, soft summer sun','playful',false),
('park_path','Park Walking Path','park',ARRAY['dog'],'tree-lined park path, dappled sunlight, soft blur','active',false),
('park_dog_run','Dog Park','park',ARRAY['dog'],'fenced dog park, soft grass, late morning sun','energetic',false),
('beach_shoreline','Beach Shoreline','beach',ARRAY['dog'],'sandy shoreline, soft waves, pastel sunset','dreamy',false),
('beach_pier','Beach Pier','beach',ARRAY['dog','other'],'wooden pier at golden hour, calm ocean, warm tones','aspirational',false),
('hiking_trail_forest','Forest Hiking Trail','hiking_trail',ARRAY['dog'],'pine forest trail, soft moss, beams of light through trees','adventurous',false),
('hiking_trail_mountain','Mountain Trail','hiking_trail',ARRAY['dog'],'mountain ridge trail, alpine grass, soft cool light','epic',false),
('hiking_trail_lake','Lake Trail','hiking_trail',ARRAY['dog'],'lakeside trail, mirror water, morning mist','serene',false),
('apartment_loft','City Apartment','apartment',ARRAY['cat','dog','other'],'small modern apartment, soft window light, plants, compact decor','cozy',false),
('apartment_balcony','Apartment Balcony','apartment',ARRAY['cat','other'],'urban balcony, potted plants, soft afternoon sun','quiet',false),
('urban_loft_industrial','Urban Industrial Loft','urban_loft',ARRAY['cat','dog','other'],'industrial loft, exposed brick, large windows, cool daylight','editorial',false),
('urban_loft_studio','Loft Studio','urban_loft',ARRAY['cat','dog','other'],'open studio loft, concrete floor, large arched window','creative',false),
('family_kitchen','Family Kitchen','family_environment',ARRAY['cat','dog','other'],'warm family kitchen, wooden table, soft natural light, lived-in feel','warm',false),
('family_livingroom','Family Living Room','family_environment',ARRAY['cat','dog','other'],'family living room, soft rug, toys nearby, golden window light','heartwarming',false),
('family_playroom','Playroom','family_environment',ARRAY['cat','dog','other'],'bright playroom, soft pastel walls, soft toys','joyful',false),
('cozy_bedroom_neutral','Cozy Neutral Bedroom','cozy_bedroom',ARRAY['cat','dog','other'],'cozy bedroom, linen bedding, soft morning light, plants','intimate',false),
('cozy_bedroom_dark','Cozy Dark Bedroom','cozy_bedroom',ARRAY['cat','other'],'moody bedroom, warm bedside lamp, dark linen, candle','snug',false),
('cozy_bedroom_loft','Loft Bedroom','cozy_bedroom',ARRAY['cat','other'],'attic loft bedroom, slanted ceiling, soft skylight','quiet',false),
('premium_pet_room_cat','Premium Cat Room','premium_pet_room',ARRAY['cat'],'editorial cat room, modular shelves, cat trees, soft daylight','curated',false),
('premium_pet_room_dog','Premium Dog Room','premium_pet_room',ARRAY['dog'],'editorial dog room, woven baskets, plush bed, soft daylight','curated',false),
('premium_pet_room_spa','Pet Spa Room','premium_pet_room',ARRAY['cat','dog'],'minimal pet spa, white tile, soft towels, soft overhead light','luxurious',false),
('kitchen_breakfast','Breakfast Kitchen','kitchen',ARRAY['cat','dog','other'],'sunlit kitchen with coffee mug, croissants, morning glow','fresh',false),
('kitchen_island','Kitchen Island','kitchen',ARRAY['cat','dog','other'],'large kitchen island, marble surface, hanging pendant lights','modern',false),
('backyard_grass','Backyard Grass','backyard',ARRAY['dog','other'],'fenced backyard, green grass, late afternoon sun','playful',false),
('backyard_deck','Backyard Deck','backyard',ARRAY['cat','dog','other'],'wooden deck, outdoor rug, string lights, golden hour','relaxed',false),
('backyard_garden','Backyard Garden','backyard',ARRAY['cat','dog','other'],'lush backyard garden, flower beds, soft afternoon light','natural',false),
('roadtrip_car_interior','Roadtrip Car Interior','roadtrip',ARRAY['dog'],'car interior on road trip, golden window light, scenery blur','wanderlust',false),
('roadtrip_van','Camper Van','roadtrip',ARRAY['dog'],'camper van interior, warm fairy lights, blanket','cozy_adventure',false),
('roadtrip_pickup','Pickup Truck Bed','roadtrip',ARRAY['dog'],'open pickup truck bed at sunset, mountains in distance','adventurous',false),
('season_spring_meadow','Spring Meadow','seasonal',ARRAY['dog','other'],'spring meadow, blooming flowers, soft warm light','fresh',true),
('season_summer_beach','Summer Beach','seasonal',ARRAY['dog'],'bright summer beach, blue sky, light reflections','vivid',true),
('season_autumn_park','Autumn Park','seasonal',ARRAY['dog','other'],'autumn park, orange leaves, golden afternoon light','nostalgic',true),
('season_autumn_forest','Autumn Forest','seasonal',ARRAY['dog'],'autumn forest trail, fallen leaves, mist','dreamy',true),
('season_winter_window','Winter Window','seasonal',ARRAY['cat','dog','other'],'cozy room with snow falling outside window, warm interior','cozy',true),
('season_winter_fireplace','Fireplace in Winter','seasonal',ARRAY['cat','dog','other'],'fireplace glow, knit blanket, snow outside','warm',true),
('season_holiday_livingroom','Holiday Living Room','seasonal',ARRAY['cat','dog','other'],'living room with holiday lights, warm decor','festive',true),
('season_holiday_kitchen','Holiday Kitchen','seasonal',ARRAY['cat','dog','other'],'kitchen with holiday baking, soft warm light','festive',true),
('modern_home_bathroom','Modern Bathroom','modern_home',ARRAY['cat','dog','other'],'modern bathroom, white tile, soft daylight','clean',false),
('luxury_home_bedroom','Luxury Bedroom','luxury_home',ARRAY['cat','dog','other'],'luxury hotel-style bedroom, linen bedding, warm lamps','premium',false),
('outdoor_lake','Outdoor Lake','outdoor',ARRAY['dog'],'calm lake, wooden dock, morning mist','serene',false),
('outdoor_meadow','Outdoor Meadow','outdoor',ARRAY['dog','other'],'wildflower meadow, golden sun, soft breeze','dreamy',false),
('park_bench','Park Bench','park',ARRAY['cat','dog','other'],'park bench under tree, soft dappled light','reflective',false),
('beach_dunes','Beach Dunes','beach',ARRAY['dog'],'sand dunes, beach grass, late sun','peaceful',false),
('hiking_trail_canyon','Canyon Trail','hiking_trail',ARRAY['dog'],'red rock canyon trail, dramatic light','epic',false),
('apartment_window_seat','Apartment Window Seat','apartment',ARRAY['cat','other'],'cushioned window seat with sun, city blur outside','quiet',false),
('urban_loft_rooftop','Loft Rooftop','urban_loft',ARRAY['cat','dog','other'],'rooftop deck, city skyline at sunset','aspirational',false),
('family_garden','Family Garden','family_environment',ARRAY['cat','dog','other'],'family garden, kids toys, soft afternoon light','heartwarming',false),
('cozy_bedroom_kids','Kids Bedroom','cozy_bedroom',ARRAY['cat','dog','other'],'kids bedroom, fairy lights, soft toys','sweet',false),
('premium_pet_room_groom','Grooming Studio','premium_pet_room',ARRAY['cat','dog'],'pro grooming studio, marble counter, soft overhead light','clean',false),
('roadtrip_scenic_overlook','Scenic Overlook','roadtrip',ARRAY['dog'],'scenic mountain overlook, parked car, golden hour','epic',false),
('season_spring_garden','Spring Garden','seasonal',ARRAY['cat','dog','other'],'spring garden, cherry blossoms, soft light','fresh',true),
('season_summer_patio','Summer Patio','seasonal',ARRAY['cat','dog','other'],'sunlit summer patio, cold drinks, warm tones','vibrant',true)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE VIEW public.cinematic_voice_performance_v
WITH (security_invoker=on) AS
SELECT
  va.voice_name,
  COUNT(*) FILTER (WHERE va.assigned_at > now() - interval '30 days') AS picks_30d,
  COALESCE(AVG(NULLIF(vm.outbound_clicks::numeric / NULLIF(vm.impressions,0), 0)), 0) AS avg_ctr_30d,
  COALESCE(SUM(vm.outbound_clicks),0) AS clicks_30d,
  COALESCE(SUM(vm.impressions),0) AS impressions_30d
FROM public.pinterest_voice_assignments va
LEFT JOIN public.pinterest_video_metrics vm
  ON vm.pin_id = va.pin_id AND vm.day > current_date - 30
WHERE va.assigned_at > now() - interval '30 days'
GROUP BY va.voice_name;
GRANT SELECT ON public.cinematic_voice_performance_v TO authenticated, service_role;
