
CREATE TABLE IF NOT EXISTS public.ppe_story_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL,
  product_slug text,
  story text NOT NULL,
  primary_emotion text NOT NULL,
  secondary_emotion text,
  desired_response text,
  buying_motivations jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  scene_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'heuristic',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ppe_story_profiles_uniq
  ON public.ppe_story_profiles (niche, COALESCE(product_slug, ''));
GRANT SELECT ON public.ppe_story_profiles TO authenticated;
GRANT ALL ON public.ppe_story_profiles TO service_role;
ALTER TABLE public.ppe_story_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppe_story_profiles admin read" ON public.ppe_story_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ppe_brand_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'general',
  enabled boolean NOT NULL DEFAULT true,
  weight numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ppe_brand_badges TO authenticated;
GRANT ALL ON public.ppe_brand_badges TO service_role;
ALTER TABLE public.ppe_brand_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppe_brand_badges admin read" ON public.ppe_brand_badges
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ppe_brand_badges (text, category) VALUES
('Adventure Ready','lifestyle'),('Vet Recommended','trust'),('Daily Essential','utility'),
('Customer Favorite','social'),('Best Seller','social'),('Editor''s Pick','curated'),
('Built for Everyday','utility'),('Made for Happy Pets','emotional'),('Loved by Dogs','emotional'),
('Loved by Cats','emotional'),('Walk Ready','lifestyle'),('Outdoor Tested','lifestyle'),
('Weekend Favorite','lifestyle'),('Premium Pick','curated'),('Family Favorite','social'),
('Top Rated','social'),('Indoor Essential','utility'),('Quiet Home Pick','lifestyle'),
('Small Space Friendly','utility'),('Made for Real Life','utility'),('Trusted by Pet Parents','trust'),
('Cozy Home Essential','lifestyle'),('Modern Pet Home','lifestyle'),('Trainer Approved','trust'),
('Travel Ready','lifestyle'),('Built to Last','utility'),('Hands-Free Helper','utility'),
('Calm Routine','emotional'),('Mess-Free Win','utility'),('Curated for US Homes','curated')
ON CONFLICT (text) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ppe_badge_usage (
  id bigserial PRIMARY KEY,
  badge_id uuid NOT NULL REFERENCES public.ppe_brand_badges(id) ON DELETE CASCADE,
  creative_id uuid,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppe_badge_usage_recent ON public.ppe_badge_usage (used_at DESC);
GRANT SELECT ON public.ppe_badge_usage TO authenticated;
GRANT ALL ON public.ppe_badge_usage TO service_role;
ALTER TABLE public.ppe_badge_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppe_badge_usage admin read" ON public.ppe_badge_usage
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ppe_candidate_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid,
  candidate_set_id uuid,
  product_slug text,
  niche text,
  ctr_prediction int,
  save_prediction int,
  purchase_prediction int,
  product_visibility int,
  scroll_stop int,
  novelty int,
  us_relevance int,
  composite int,
  attention_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  badge_text text,
  story text,
  primary_emotion text,
  competitor_verdict text,
  winner boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppe_scores_creative ON public.ppe_candidate_scores (creative_id);
CREATE INDEX IF NOT EXISTS ppe_scores_recent ON public.ppe_candidate_scores (created_at DESC);
GRANT SELECT ON public.ppe_candidate_scores TO authenticated;
GRANT ALL ON public.ppe_candidate_scores TO service_role;
ALTER TABLE public.ppe_candidate_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppe_candidate_scores admin read" ON public.ppe_candidate_scores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.pcie_v2_creatives
  ADD COLUMN IF NOT EXISTS ppe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ppe_composite int,
  ADD COLUMN IF NOT EXISTS ppe_winner boolean NOT NULL DEFAULT false;

INSERT INTO public.pcie_v2_feature_flags (flag, enabled, notes) VALUES
  ('ppe_enabled', true, 'Pinterest Psychology Engine: story-first reasoning + multi-candidate competition'),
  ('ppe_hard_gate', true, 'Enforce PPE hard floors before publishing'),
  ('ppe_multi_candidate', true, 'Force at least ppe_min_candidates per product')
ON CONFLICT (flag) DO NOTHING;

INSERT INTO public.pcie_v2_config (key, value, description) VALUES
  ('ppe_min_candidates', '8'::jsonb, 'Minimum candidates per product when PPE active'),
  ('ppe_max_candidates', '12'::jsonb, 'Cap of candidates per product when PPE active'),
  ('ppe_visibility_floor', '95'::jsonb, 'Minimum product visibility score'),
  ('ppe_ctr_floor', '95'::jsonb, 'Minimum predicted CTR score'),
  ('ppe_novelty_floor', '96'::jsonb, 'Minimum novelty score'),
  ('ppe_composite_floor', '92'::jsonb, 'Minimum composite PPE score to publish')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcie_v2_scoring_axes (slug, name, evaluator, weight, pass_threshold, hard_reject, enabled) VALUES
  ('ppe_product_visibility','PPE Product Visibility','ppe_axis', 2.0, 95, true, true),
  ('ppe_ctr_prediction',   'PPE CTR Prediction',    'ppe_axis', 2.0, 90, true, true),
  ('ppe_save_prediction',  'PPE Save Prediction',   'ppe_axis', 1.2, 80, false,true),
  ('ppe_scroll_stop',      'PPE Scroll Stop Power', 'ppe_axis', 1.5, 88, true, true),
  ('ppe_us_relevance',     'PPE US Relevance',      'ppe_axis', 1.3, 90, true, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.pcie_v2_pipeline_stages (slug, name, handler, order_index, enabled) VALUES
  ('ppe_story_profile',    'PPE Story Profile',         'ppe_story_profile',    35, true),
  ('ppe_badge',            'PPE Brand Badge',           'ppe_badge',            55, true),
  ('ppe_title_rewrite',    'PPE Title Rewrite',         'ppe_title_rewrite',    58, true),
  ('ppe_attention_map',    'PPE Attention Map',         'ppe_attention_map',    72, true),
  ('ppe_predict',          'PPE Predict CTR/Save/Buy',  'ppe_predict',          88, true),
  ('ppe_competitor_sim',   'PPE Competitor Simulation', 'ppe_competitor_sim',   92, true),
  ('ppe_persist',          'PPE Persist Scores',        'ppe_persist',          96, true)
ON CONFLICT (slug) DO NOTHING;
