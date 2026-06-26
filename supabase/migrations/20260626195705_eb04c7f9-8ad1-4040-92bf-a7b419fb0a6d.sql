-- Evolution Engine Phase 2: additive tables only (ee_p2_*)

-- 1. TREND ENGINE
CREATE TABLE public.ee_p2_trend_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL, -- 'product_trending','seasonal','pinterest_velocity','category_growth','viral','declining'
  entity_type text NOT NULL, -- 'product','category','keyword','board'
  entity_id text NOT NULL,
  entity_label text,
  score numeric NOT NULL DEFAULT 0,
  velocity numeric DEFAULT 0,
  momentum numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  window_days integer DEFAULT 7,
  evidence jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_trend_signals TO authenticated;
GRANT ALL ON public.ee_p2_trend_signals TO service_role;
ALTER TABLE public.ee_p2_trend_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read trend signals" ON public.ee_p2_trend_signals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ee_p2_trend_signals_type_detected ON public.ee_p2_trend_signals(signal_type, detected_at DESC);
CREATE INDEX idx_ee_p2_trend_signals_entity ON public.ee_p2_trend_signals(entity_type, entity_id);

-- 2. EMOTION ENGINE
CREATE TABLE public.ee_p2_emotion_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text NOT NULL,
  source_table text NOT NULL DEFAULT 'pcie2_creatives',
  curiosity numeric DEFAULT 0,
  urgency numeric DEFAULT 0,
  excitement numeric DEFAULT 0,
  trust numeric DEFAULT 0,
  cuteness numeric DEFAULT 0,
  fomo numeric DEFAULT 0,
  luxury numeric DEFAULT 0,
  humor numeric DEFAULT 0,
  problem_solving numeric DEFAULT 0,
  transformation numeric DEFAULT 0,
  before_after numeric DEFAULT 0,
  lifestyle numeric DEFAULT 0,
  surprise numeric DEFAULT 0,
  dominant_emotion text,
  emotion_vector jsonb DEFAULT '{}'::jsonb,
  model_version text DEFAULT 'v1',
  scored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_emotion_scores TO authenticated;
GRANT ALL ON public.ee_p2_emotion_scores TO service_role;
ALTER TABLE public.ee_p2_emotion_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read emotion" ON public.ee_p2_emotion_scores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ee_p2_emotion_creative ON public.ee_p2_emotion_scores(creative_id, scored_at DESC);

-- 3. IMAGE DNA ENGINE
CREATE TABLE public.ee_p2_image_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text NOT NULL,
  image_url text,
  image_hash text,
  dominant_colors jsonb DEFAULT '[]'::jsonb,
  composition text,
  framing text,
  brightness numeric,
  subject_placement text,
  realism numeric,
  visual_complexity numeric,
  pet_species text,
  product_visibility numeric,
  cta_visibility numeric,
  branding_visibility numeric,
  cluster_id uuid,
  fingerprint jsonb DEFAULT '{}'::jsonb,
  model_version text DEFAULT 'v1',
  scored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_image_dna TO authenticated;
GRANT ALL ON public.ee_p2_image_dna TO service_role;
ALTER TABLE public.ee_p2_image_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read image dna" ON public.ee_p2_image_dna
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ee_p2_image_dna_creative ON public.ee_p2_image_dna(creative_id);
CREATE INDEX idx_ee_p2_image_dna_cluster ON public.ee_p2_image_dna(cluster_id);

CREATE TABLE public.ee_p2_image_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  centroid jsonb DEFAULT '{}'::jsonb,
  member_count integer DEFAULT 0,
  avg_ctr numeric DEFAULT 0,
  avg_saves numeric DEFAULT 0,
  performance_score numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_image_clusters TO authenticated;
GRANT ALL ON public.ee_p2_image_clusters TO service_role;
ALTER TABLE public.ee_p2_image_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read image clusters" ON public.ee_p2_image_clusters
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. EXPERIMENT ENGINE
CREATE TABLE public.ee_p2_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_type text NOT NULL, -- headline|hook|cta|board|image_style|emotion|posting_time|aspect_ratio
  hypothesis text,
  status text NOT NULL DEFAULT 'observing', -- observing|complete|inconclusive
  variants jsonb DEFAULT '[]'::jsonb,
  winner_variant text,
  confidence numeric DEFAULT 0,
  uplift numeric DEFAULT 0,
  sample_size integer DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_experiments TO authenticated;
GRANT ALL ON public.ee_p2_experiments TO service_role;
ALTER TABLE public.ee_p2_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read experiments" ON public.ee_p2_experiments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ee_p2_experiments_type_status ON public.ee_p2_experiments(experiment_type, status);

-- 5. LEARNING TRAINING DATA
CREATE TABLE public.ee_p2_training_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text,
  creative_id text,
  product_id text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcomes jsonb NOT NULL DEFAULT '{}'::jsonb, -- impressions, saves, outbound_clicks, ctr, conversions, purchases, revenue, roas, time_on_page, bounce_rate
  label_score numeric,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_training_samples TO authenticated;
GRANT ALL ON public.ee_p2_training_samples TO service_role;
ALTER TABLE public.ee_p2_training_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read training" ON public.ee_p2_training_samples
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ee_p2_training_pin ON public.ee_p2_training_samples(pin_id);

-- 6. RECOMMENDATIONS
CREATE TABLE public.ee_p2_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_type text NOT NULL, -- headline|hook|emotion|board|publish_time|image_style|cta
  target_entity_type text, -- product|category|global
  target_entity_id text,
  recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning text,
  expected_uplift numeric,
  confidence numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'observed', -- observed only (never auto-applied)
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_recommendations TO authenticated;
GRANT ALL ON public.ee_p2_recommendations TO service_role;
ALTER TABLE public.ee_p2_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read recs" ON public.ee_p2_recommendations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ee_p2_recs_type_generated ON public.ee_p2_recommendations(rec_type, generated_at DESC);

-- 7. WINNING FAMILIES (headlines, hooks, ctas)
CREATE TABLE public.ee_p2_winning_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_type text NOT NULL, -- headline|hook|cta
  pattern text NOT NULL,
  pattern_sample text,
  sample_size integer DEFAULT 0,
  avg_ctr numeric DEFAULT 0,
  avg_saves numeric DEFAULT 0,
  avg_revenue numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  last_observed timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_winning_families TO authenticated;
GRANT ALL ON public.ee_p2_winning_families TO service_role;
ALTER TABLE public.ee_p2_winning_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read families" ON public.ee_p2_winning_families
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. MODEL ACCURACY
CREATE TABLE public.ee_p2_model_accuracy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  model_version text NOT NULL,
  metric_name text NOT NULL, -- mae|rmse|r2|auc
  metric_value numeric NOT NULL,
  sample_size integer DEFAULT 0,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_model_accuracy TO authenticated;
GRANT ALL ON public.ee_p2_model_accuracy TO service_role;
ALTER TABLE public.ee_p2_model_accuracy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read accuracy" ON public.ee_p2_model_accuracy
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 9. NIGHTLY RUNS
CREATE TABLE public.ee_p2_nightly_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL DEFAULT 'nightly',
  status text NOT NULL DEFAULT 'running', -- running|complete|failed
  steps jsonb DEFAULT '[]'::jsonb,
  stats jsonb DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_nightly_runs TO authenticated;
GRANT ALL ON public.ee_p2_nightly_runs TO service_role;
ALTER TABLE public.ee_p2_nightly_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read nightly" ON public.ee_p2_nightly_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 10. SETTINGS (observation flags, all default OFF for mutation, observation always ON)
CREATE TABLE public.ee_p2_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_p2_settings TO authenticated;
GRANT ALL ON public.ee_p2_settings TO service_role;
ALTER TABLE public.ee_p2_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read settings" ON public.ee_p2_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin write settings" ON public.ee_p2_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ee_p2_settings(key, value, description) VALUES
  ('observation_only', 'true'::jsonb, 'Phase 2 hard lock: never publish, never mutate production'),
  ('trend_engine_enabled', 'true'::jsonb, 'Detect-only trend engine'),
  ('emotion_engine_enabled', 'true'::jsonb, 'Score-only emotion engine'),
  ('image_dna_enabled', 'true'::jsonb, 'Fingerprint-only image DNA engine'),
  ('experiment_engine_enabled', 'true'::jsonb, 'Observation-only experiment tracker'),
  ('learning_engine_enabled', 'true'::jsonb, 'Ingest-only learning engine'),
  ('recommendation_engine_enabled', 'true'::jsonb, 'Generate-only recommendation engine');
