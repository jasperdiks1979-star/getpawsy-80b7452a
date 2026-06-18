
-- V5 Cinematic UGC Story Ads
CREATE TABLE IF NOT EXISTS public.cv5_storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  product_slug TEXT,
  product_title TEXT,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  beats JSONB NOT NULL DEFAULT '[]'::jsonb,
  vo_audio_url TEXT,
  vo_total_duration_s NUMERIC,
  scene_image_urls JSONB DEFAULT '[]'::jsonb,
  source_images JSONB DEFAULT '[]'::jsonb,
  quality_score INT,
  quality_breakdown JSONB,
  mp4_url TEXT,
  thumbnail_url TEXT,
  github_run_id BIGINT,
  github_run_url TEXT,
  last_render_dispatched_at TIMESTAMPTZ,
  render_error TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cv5_storyboards TO authenticated;
GRANT ALL ON public.cv5_storyboards TO service_role;

ALTER TABLE public.cv5_storyboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read v5 storyboards"
  ON public.cv5_storyboards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access v5 storyboards"
  ON public.cv5_storyboards FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cv5_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER cv5_storyboards_updated_at
  BEFORE UPDATE ON public.cv5_storyboards
  FOR EACH ROW EXECUTE FUNCTION public.cv5_set_updated_at();

-- Story templates per niche
CREATE TABLE IF NOT EXISTS public.cv5_story_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL UNIQUE,
  beats JSONB NOT NULL,
  voice_id TEXT NOT NULL DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cv5_story_templates TO authenticated;
GRANT ALL ON public.cv5_story_templates TO service_role;
ALTER TABLE public.cv5_story_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v5 templates"
  ON public.cv5_story_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage RLS: only service_role writes; admins can read via signed URLs (signed URLs bypass RLS for read)
CREATE POLICY "Service role manages cv5 storage"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'cinematic-ads-v5') WITH CHECK (bucket_id = 'cinematic-ads-v5');

-- Seed templates: cat-toy, litter-box, dog-bed, generic
INSERT INTO public.cv5_story_templates (niche, beats, voice_id) VALUES
('cat-toy', '[
  {"role":"hook","duration_s":3,"caption":"Bored cat? Watch.","vo_line":"Your cat is bored, restless, and ignoring every toy you own.","scene":"A bored tabby cat lying on a beige couch in a sunlit modern living room, staring blankly, low angle, cinematic shallow depth of field","camera":"slow_push_in"},
  {"role":"problem","duration_s":5,"caption":"Same toys. No spark.","vo_line":"Same old toys, same flat afternoon, and a cat that just won''t engage.","scene":"Close up of a pile of dusty unused cat toys on a wooden floor next to a disinterested cat looking away, soft natural window light","camera":"pan_left"},
  {"role":"solution","duration_s":7,"caption":"One toy changes it.","vo_line":"Then one smart, motion-activated ball turns the whole room into a chase.","scene":"A cat mid-pounce chasing a small bright interactive ball across a Scandinavian living room rug, motion blur, dynamic action shot","camera":"tracking_shot"},
  {"role":"benefit","duration_s":7,"caption":"Happy cat. Calm home.","vo_line":"Hours of natural play, a tired happy cat, and finally a calm evening for you.","scene":"A content cat curled up sleeping on a couch next to a smiling woman reading a book, warm golden hour light through window, cozy lifestyle","camera":"slow_dolly_out"},
  {"role":"cta","duration_s":8,"caption":"Tap to see why.","vo_line":"Tap the pin to see why thousands of cat owners swear by it.","scene":"Hero product shot of the interactive cat toy ball on a styled wooden side table in a bright living room, soft window light, lifestyle magazine quality","camera":"hold"}
]'::jsonb, 'EXAVITQu4vr4xnSDxMaL'),
('litter-box', '[
  {"role":"hook","duration_s":3,"caption":"Litter smell? Gone.","vo_line":"That corner of your home that always smells like cat? It does not have to.","scene":"A messy traditional litter box in a dim bathroom corner, scattered litter on tile floor, realistic, slightly unappealing lighting","camera":"slow_push_in"},
  {"role":"problem","duration_s":5,"caption":"Scooping. Every. Day.","vo_line":"Daily scooping, tracked litter, and that smell you can never fully hide.","scene":"A frustrated woman holding a scoop in front of a dirty litter box, kneeling on the bathroom floor, natural daylight, candid lifestyle photograph","camera":"pan_right"},
  {"role":"solution","duration_s":7,"caption":"Self-cleaning. Sealed.","vo_line":"A self-cleaning, sealed setup that handles everything before you even notice.","scene":"A sleek modern white automatic litter box in a clean styled bathroom with plants and warm wood accents, soft morning light","camera":"slow_dolly_in"},
  {"role":"benefit","duration_s":7,"caption":"Cat loves it. You too.","vo_line":"A calm cat using it on its own, and a bathroom that finally smells like nothing.","scene":"A relaxed cat stepping out of a modern enclosed litter box in a styled minimalist bathroom, soft natural light, lifestyle photography","camera":"slow_dolly_out"},
  {"role":"cta","duration_s":8,"caption":"Tap to upgrade.","vo_line":"Tap the pin to see the setup thousands of cat owners switched to.","scene":"Lifestyle product hero shot of a modern self-cleaning litter box in a styled bathroom corner with plants, magazine quality","camera":"hold"}
]'::jsonb, 'EXAVITQu4vr4xnSDxMaL'),
('dog-bed', '[
  {"role":"hook","duration_s":3,"caption":"Restless dog? Read this.","vo_line":"If your dog keeps shifting all night, the bed is the problem.","scene":"A medium sized dog restlessly turning in circles on a thin flat dog bed in a dim living room at night, candid lifestyle photo","camera":"slow_push_in"},
  {"role":"problem","duration_s":5,"caption":"Sore joints. Bad sleep.","vo_line":"Thin foam, sore joints, and a tired dog that never really settles.","scene":"Close up of a senior dog with worried eyes lying half off a flat worn dog bed on a hardwood floor, natural soft light","camera":"pan_left"},
  {"role":"solution","duration_s":7,"caption":"Memory foam. True support.","vo_line":"Real orthopedic memory foam that actually supports every joint, every night.","scene":"A large dog deeply asleep curled into a thick plush memory foam dog bed in a cozy modern living room, warm lamp light, lifestyle photo","camera":"slow_dolly_in"},
  {"role":"benefit","duration_s":7,"caption":"Deep sleep. Calm mornings.","vo_line":"Deep uninterrupted sleep, calmer mornings, and a dog that wakes up easy.","scene":"A golden retriever stretching happily in the morning next to a styled memory foam bed in a sunlit living room, warm window light","camera":"slow_dolly_out"},
  {"role":"cta","duration_s":8,"caption":"Tap to see it.","vo_line":"Tap the pin to see why thousands of dog owners switched to this bed.","scene":"Hero lifestyle shot of a memory foam dog bed styled in a cozy modern living room with a throw blanket nearby, magazine quality","camera":"hold"}
]'::jsonb, 'EXAVITQu4vr4xnSDxMaL'),
('generic-pet', '[
  {"role":"hook","duration_s":3,"caption":"Pet life upgrade.","vo_line":"This is the small change your pet has been waiting for.","scene":"A cozy modern living room with a happy pet, warm natural light, lifestyle photography","camera":"slow_push_in"},
  {"role":"problem","duration_s":5,"caption":"Everyday frustration.","vo_line":"Little daily frustrations that quietly add up for you and your pet.","scene":"A candid scene of a pet owner looking slightly tired in a real home, natural light, lifestyle","camera":"pan_right"},
  {"role":"solution","duration_s":7,"caption":"One smart fix.","vo_line":"One smart, simple product that finally makes pet life easier.","scene":"A clean styled product setup in a modern home, warm light, lifestyle magazine","camera":"slow_dolly_in"},
  {"role":"benefit","duration_s":7,"caption":"Happier pet. Calmer home.","vo_line":"A happier pet, a calmer home, and one less thing on your mind.","scene":"A relaxed pet and a smiling owner together in a sunlit living room, warm cozy lifestyle","camera":"slow_dolly_out"},
  {"role":"cta","duration_s":8,"caption":"Tap to see why.","vo_line":"Tap the pin to see what thousands of pet owners love about it.","scene":"Hero lifestyle product shot in a styled cozy living room, magazine quality","camera":"hold"}
]'::jsonb, 'EXAVITQu4vr4xnSDxMaL')
ON CONFLICT (niche) DO UPDATE SET beats = EXCLUDED.beats, voice_id = EXCLUDED.voice_id;
