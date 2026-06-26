
CREATE TABLE IF NOT EXISTS public.pcie2_ci_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_row_id uuid REFERENCES public.pcie2_publish_queue(id) ON DELETE CASCADE,
  product_id uuid,
  product_slug text,
  headline text,
  description text,
  cta text,
  family text,
  emotion text,
  angle text,
  hook text,
  overall_score numeric NOT NULL DEFAULT 0,
  spam_score numeric NOT NULL DEFAULT 0,
  trust_score numeric NOT NULL DEFAULT 0,
  seo_score numeric NOT NULL DEFAULT 0,
  novelty_score numeric NOT NULL DEFAULT 0,
  ctr_prediction numeric NOT NULL DEFAULT 0,
  save_prediction numeric NOT NULL DEFAULT 0,
  outbound_prediction numeric NOT NULL DEFAULT 0,
  recommendation_probability numeric NOT NULL DEFAULT 0,
  claim_risk numeric NOT NULL DEFAULT 0,
  duplicate_similarity numeric NOT NULL DEFAULT 0,
  category_consistency numeric NOT NULL DEFAULT 0,
  brand_consistency numeric NOT NULL DEFAULT 0,
  image_match numeric NOT NULL DEFAULT 0,
  rejected boolean NOT NULL DEFAULT false,
  reject_reasons text[],
  banned_phrases text[],
  rewrite_applied boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_ci_scores TO authenticated;
GRANT ALL ON public.pcie2_ci_scores TO service_role;
ALTER TABLE public.pcie2_ci_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_scores_admin_read" ON public.pcie2_ci_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ci_scores_service_all" ON public.pcie2_ci_scores TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ci_scores_queue ON public.pcie2_ci_scores(queue_row_id);
CREATE INDEX IF NOT EXISTS idx_ci_scores_created ON public.pcie2_ci_scores(created_at DESC);

CREATE TABLE IF NOT EXISTS public.pcie2_ci_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text,
  scope text,
  total_rows int NOT NULL DEFAULT 0,
  passed int NOT NULL DEFAULT 0,
  rewritten int NOT NULL DEFAULT 0,
  rejected int NOT NULL DEFAULT 0,
  avg_score numeric,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pcie2_ci_runs TO authenticated;
GRANT ALL ON public.pcie2_ci_runs TO service_role;
ALTER TABLE public.pcie2_ci_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_runs_admin_read" ON public.pcie2_ci_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ci_runs_service_all" ON public.pcie2_ci_runs TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie2_ci_banned_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'medical_claim',
  severity text NOT NULL DEFAULT 'hard_block',
  hits int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_ci_banned_phrases TO authenticated;
GRANT ALL ON public.pcie2_ci_banned_phrases TO service_role;
ALTER TABLE public.pcie2_ci_banned_phrases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_banned_admin_read" ON public.pcie2_ci_banned_phrases FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ci_banned_service_all" ON public.pcie2_ci_banned_phrases TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.pcie2_ci_banned_phrases(phrase, category, severity) VALUES
  ('vets recommend','medical_claim','hard_block'),
  ('vet recommended','medical_claim','hard_block'),
  ('veterinarian approved','medical_claim','hard_block'),
  ('vet approved','medical_claim','hard_block'),
  ('clinically proven','medical_claim','hard_block'),
  ('doctor recommended','medical_claim','hard_block'),
  ('9 out of 10','medical_claim','hard_block'),
  ('guaranteed','superlative','hard_block'),
  ('miracle','superlative','hard_block'),
  ('instantly','superlative','hard_block'),
  ('stop every day','superlative','hard_block'),
  ('never scoop again','superlative','hard_block'),
  ('cure','medical_claim','hard_block'),
  ('healing','medical_claim','hard_block'),
  ('treatment','medical_claim','hard_block'),
  ('recovery routine','medical_claim','hard_block'),
  ('medical','medical_claim','hard_block'),
  ('disease','medical_claim','hard_block'),
  ('pain relief','medical_claim','hard_block'),
  ('anxiety cure','medical_claim','hard_block'),
  ('post-surgery','medical_claim','hard_block'),
  ('post surgery','medical_claim','hard_block'),
  ('after surgery','medical_claim','hard_block')
ON CONFLICT (phrase) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pcie2_ci_diversity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature text NOT NULL,
  dimension text NOT NULL,
  value text NOT NULL,
  queue_row_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_ci_diversity_log TO authenticated;
GRANT ALL ON public.pcie2_ci_diversity_log TO service_role;
ALTER TABLE public.pcie2_ci_diversity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_div_admin_read" ON public.pcie2_ci_diversity_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ci_div_service_all" ON public.pcie2_ci_diversity_log TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ci_div_dim ON public.pcie2_ci_diversity_log(dimension, created_at DESC);
