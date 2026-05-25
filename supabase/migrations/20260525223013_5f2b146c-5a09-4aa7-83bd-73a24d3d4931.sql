
-- 1. Extend cinematic_ad_jobs
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS voiceover_url text,
  ADD COLUMN IF NOT EXISTS voiceover_voice_id text,
  ADD COLUMN IF NOT EXISTS voiceover_script jsonb,
  ADD COLUMN IF NOT EXISTS music_track_id uuid,
  ADD COLUMN IF NOT EXISTS variation_signature text,
  ADD COLUMN IF NOT EXISTS cinematic_quality_score numeric;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_variation_signature
  ON public.cinematic_ad_jobs(variation_signature)
  WHERE variation_signature IS NOT NULL;

-- 2. Voice profiles
CREATE TABLE IF NOT EXISTS public.cinematic_voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text NOT NULL UNIQUE,
  label text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('female', 'male')),
  tone text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cinematic_voice_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice profiles readable" ON public.cinematic_voice_profiles;
CREATE POLICY "voice profiles readable" ON public.cinematic_voice_profiles FOR SELECT USING (true);

INSERT INTO public.cinematic_voice_profiles (voice_id, label, gender, tone, weight) VALUES
  ('EXAVITQu4vr4xnSDxMaL', 'Sarah',    'female', 'warm-friendly',      1.2),
  ('cgSgspJ2msm6clMCkdW9', 'Jessica',  'female', 'bright-confident',   1.0),
  ('XrExE9yKIg1WjnnlVkGX', 'Matilda',  'female', 'calm-premium',       1.0),
  ('nPczCjzI2devNBz1zQrb', 'Brian',    'male',   'deep-trustworthy',   1.0),
  ('cjVigY5qzO86Huf0OWal', 'Eric',     'male',   'casual-modern',      1.0),
  ('TX3LPaxmHKxFdv7VOQHJ', 'Liam',     'male',   'youthful-energetic', 1.0)
ON CONFLICT (voice_id) DO NOTHING;

-- 3. Voice-over line bank
CREATE TABLE IF NOT EXISTS public.cinematic_voiceover_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype text NOT NULL,
  beat text NOT NULL CHECK (beat IN ('hook','problem','solution','demo','benefit','proof','cta')),
  text text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cinematic_voiceover_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voiceover lines readable" ON public.cinematic_voiceover_lines;
CREATE POLICY "voiceover lines readable" ON public.cinematic_voiceover_lines FOR SELECT USING (true);

INSERT INTO public.cinematic_voiceover_lines (archetype, beat, text) VALUES
  -- HOOK
  ('product_spotlight','hook','I genuinely wish I bought this sooner.'),
  ('product_spotlight','hook','This is the smart cat upgrade everyone is talking about.'),
  ('product_spotlight','hook','Okay, this actually changed my routine.'),
  ('product_spotlight','hook','If you have a cat, you need to see this.'),
  ('ugc_pov','hook','POV: you finally bought the thing TikTok told you to.'),
  ('ugc_pov','hook','My cat after one day with this:'),
  ('ugc_pov','hook','Three weeks in. Honest review.'),
  ('ugc_pov','hook','I was today years old when I learned about this.'),
  ('compilation','hook','Five smart pet picks worth saving.'),
  ('compilation','hook','The only cat product list you actually need.'),
  ('compilation','hook','Smart cat gear that quietly upgraded my home.'),
  ('lifestyle_scene','hook','The cozy era. Cat parent edition.'),
  ('lifestyle_scene','hook','Less stuff. More cat.'),
  -- PROBLEM
  ('product_spotlight','problem','No more scooping every single day.'),
  ('product_spotlight','problem','The smell, the mess, the daily routine.'),
  ('ugc_pov','problem','I was spending way too much time on litter.'),
  ('compilation','problem','Pet parenting in 2026 hits different.'),
  -- SOLUTION
  ('product_spotlight','solution','This smart litter box changed our routine completely.'),
  ('product_spotlight','solution','Self-cleaning, app-controlled, basically does the work for you.'),
  ('ugc_pov','solution','And then I tried this. Day one.'),
  ('compilation','solution','Here are five that actually earned their spot.'),
  -- DEMO
  ('product_spotlight','demo','You set it up, you open the app, you forget about it.'),
  ('product_spotlight','demo','Watch how quietly it does its thing.'),
  ('ugc_pov','demo','Look how chill she is around it.'),
  ('compilation','demo','Tap to see why this one made the cut.'),
  -- BENEFIT
  ('product_spotlight','benefit','My weekends got an hour back.'),
  ('product_spotlight','benefit','Clean apartment. Happy cat. Less work.'),
  ('ugc_pov','benefit','No regrets. Wish I bought this sooner.'),
  ('compilation','benefit','Each one saves time. Every single day.'),
  -- PROOF
  ('product_spotlight','proof','Thousands of cat parents already made the switch.'),
  ('product_spotlight','proof','This is why it keeps going viral.'),
  ('ugc_pov','proof','My friends keep asking what this is.'),
  ('compilation','proof','These are the ones pet parents actually keep buying.'),
  -- CTA
  ('product_spotlight','cta','Tap the link to see it.'),
  ('product_spotlight','cta','Save this for later.'),
  ('product_spotlight','cta','See it before it sells out.'),
  ('ugc_pov','cta','Link in bio. Go look.'),
  ('ugc_pov','cta','You will thank me later.'),
  ('compilation','cta','Save the list. Pick your favorite.'),
  ('lifestyle_scene','cta','Tap to shop the room.'),
  ('lifestyle_scene','cta','Bring it home.')
ON CONFLICT DO NOTHING;

-- 4. Music tracks (URLs to be populated with curated royalty-free assets)
CREATE TABLE IF NOT EXISTS public.cinematic_music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  mood text NOT NULL,
  bpm int,
  license text NOT NULL DEFAULT 'royalty-free',
  duration_seconds int,
  weight numeric NOT NULL DEFAULT 1.0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cinematic_music_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "music tracks readable" ON public.cinematic_music_tracks;
CREATE POLICY "music tracks readable" ON public.cinematic_music_tracks FOR SELECT USING (true);

-- 5. Cinematic settings flags for video-first enforcement
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS voiceover_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS video_share_floor numeric NOT NULL DEFAULT 0.95,
  ADD COLUMN IF NOT EXISTS static_share_cap  numeric NOT NULL DEFAULT 0.05;
