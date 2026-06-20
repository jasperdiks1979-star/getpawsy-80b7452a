
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS creative_score integer,
  ADD COLUMN IF NOT EXISTS creative_score_voice integer,
  ADD COLUMN IF NOT EXISTS creative_score_motion integer,
  ADD COLUMN IF NOT EXISTS creative_score_product_visibility integer,
  ADD COLUMN IF NOT EXISTS creative_score_conversion integer,
  ADD COLUMN IF NOT EXISTS creative_score_brand integer,
  ADD COLUMN IF NOT EXISTS creative_quality_tier text,
  ADD COLUMN IF NOT EXISTS gold_standard_benchmark_id uuid,
  ADD COLUMN IF NOT EXISTS cloned_from_winner_id uuid;

ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS gold_standard_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gold_standard_min_score integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS gold_standard_priority_score integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS gold_standard_reference_slug text NOT NULL DEFAULT 'cat-scratching-bed';

CREATE TABLE IF NOT EXISTS public.pinterest_creative_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  product_slug text,
  reference_job_id uuid,
  reference_pin_id text,
  reference_video_url text,
  target_voice_score integer NOT NULL DEFAULT 85,
  target_motion_score integer NOT NULL DEFAULT 85,
  target_product_visibility integer NOT NULL DEFAULT 85,
  target_conversion integer NOT NULL DEFAULT 85,
  target_brand integer NOT NULL DEFAULT 85,
  pacing_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  camera_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_creative_benchmarks TO authenticated;
GRANT ALL ON public.pinterest_creative_benchmarks TO service_role;
ALTER TABLE public.pinterest_creative_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read benchmarks" ON public.pinterest_creative_benchmarks;
CREATE POLICY "admins read benchmarks" ON public.pinterest_creative_benchmarks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pinterest_winner_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_job_id uuid,
  source_pin_id text,
  category text,
  product_slug text,
  ctr numeric,
  outbound_clicks integer,
  saves integer,
  purchases integer,
  voice_name text,
  voice_type text,
  voice_style text,
  pacing_profile jsonb,
  camera_profile jsonb,
  cta_structure text,
  hook_text text,
  composite_score numeric,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_winner_dna TO authenticated;
GRANT ALL ON public.pinterest_winner_dna TO service_role;
ALTER TABLE public.pinterest_winner_dna ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read winner dna" ON public.pinterest_winner_dna;
CREATE POLICY "admins read winner dna" ON public.pinterest_winner_dna
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cinematic_jobs_creative_tier
  ON public.cinematic_ad_jobs (creative_quality_tier);
CREATE INDEX IF NOT EXISTS idx_winner_dna_category
  ON public.pinterest_winner_dna (category, composite_score DESC);

INSERT INTO public.pinterest_creative_benchmarks (name, product_slug, notes, pacing_profile, camera_profile, voice_profile)
SELECT
  'Cat Scratching Bed — Gold Standard',
  'cat-scratching-bed',
  'Reference benchmark. Slow zoom + reveal, single-headline, premium female voice, product visible >=80% of runtime.',
  '{"min_scenes":6,"max_headline_at_once":1,"max_text_screen_pct":15,"avoid":["fast_cuts","tiktok_effects"]}'::jsonb,
  '{"prefer":["slow_zoom","slow_pan","product_reveal","depth_movement"]}'::jsonb,
  '{"prefer":["Female Premium","Female Storytelling","Female Friendly","Male Trustworthy","Male Premium"],"avoid_robot":true,"max_consecutive_same":2}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.pinterest_creative_benchmarks WHERE product_slug = 'cat-scratching-bed'
);
