
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.pcie2_concept_graph (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.pcie2_concept_graph(id) ON DELETE CASCADE,
  product_id uuid,
  scope text NOT NULL DEFAULT 'product',
  branch_type text NOT NULL,
  family text,
  angle text NOT NULL,
  depth int NOT NULL DEFAULT 0,
  saturation_score numeric NOT NULL DEFAULT 0,
  uses_count int NOT NULL DEFAULT 0,
  last_expanded_at timestamptz,
  last_used_at timestamptz,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pcie2_concept_graph TO service_role;
GRANT SELECT ON public.pcie2_concept_graph TO authenticated;
ALTER TABLE public.pcie2_concept_graph ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "concept_graph_service" ON public.pcie2_concept_graph;
DROP POLICY IF EXISTS "concept_graph_admin_read" ON public.pcie2_concept_graph;
CREATE POLICY "concept_graph_service" ON public.pcie2_concept_graph FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "concept_graph_admin_read" ON public.pcie2_concept_graph FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS pcie2_concept_graph_product_idx ON public.pcie2_concept_graph(product_id);
CREATE INDEX IF NOT EXISTS pcie2_concept_graph_parent_idx ON public.pcie2_concept_graph(parent_id);
CREATE INDEX IF NOT EXISTS pcie2_concept_graph_sat_idx ON public.pcie2_concept_graph(saturation_score);
CREATE INDEX IF NOT EXISTS pcie2_concept_graph_emb_idx ON public.pcie2_concept_graph USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.pcie2_creative_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  prompt_template text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  cooldown_minutes int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  uses_count int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pcie2_creative_families TO service_role;
GRANT SELECT ON public.pcie2_creative_families TO authenticated;
ALTER TABLE public.pcie2_creative_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fam_service" ON public.pcie2_creative_families;
DROP POLICY IF EXISTS "fam_admin_read" ON public.pcie2_creative_families;
CREATE POLICY "fam_service" ON public.pcie2_creative_families FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "fam_admin_read" ON public.pcie2_creative_families FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_visual_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text UNIQUE NOT NULL,
  camera_angle text, lighting text, background text, composition text,
  pet_breed text, pet_age text, room text, season text, weather text,
  lens text, depth_of_field text, color_palette text, cropping text, layout text,
  uses_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pcie2_visual_dna TO service_role;
GRANT SELECT ON public.pcie2_visual_dna TO authenticated;
ALTER TABLE public.pcie2_visual_dna ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vdna_service" ON public.pcie2_visual_dna;
DROP POLICY IF EXISTS "vdna_admin_read" ON public.pcie2_visual_dna;
CREATE POLICY "vdna_service" ON public.pcie2_visual_dna FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "vdna_admin_read" ON public.pcie2_visual_dna FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_headline_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  intent text NOT NULL,
  template text NOT NULL,
  avg_similarity numeric NOT NULL DEFAULT 0,
  uses_count int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pcie2_headline_families TO service_role;
GRANT SELECT ON public.pcie2_headline_families TO authenticated;
ALTER TABLE public.pcie2_headline_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hf_service" ON public.pcie2_headline_families;
DROP POLICY IF EXISTS "hf_admin_read" ON public.pcie2_headline_families;
CREATE POLICY "hf_service" ON public.pcie2_headline_families FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "hf_admin_read" ON public.pcie2_headline_families FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_cta_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  intent text NOT NULL,
  template text NOT NULL,
  uses_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pcie2_cta_families TO service_role;
GRANT SELECT ON public.pcie2_cta_families TO authenticated;
ALTER TABLE public.pcie2_cta_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cf_service" ON public.pcie2_cta_families;
DROP POLICY IF EXISTS "cf_admin_read" ON public.pcie2_cta_families;
CREATE POLICY "cf_service" ON public.pcie2_cta_families FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "cf_admin_read" ON public.pcie2_cta_families FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_mutation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  product_id uuid,
  reason text NOT NULL,
  strategy text NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  before jsonb,
  after jsonb,
  outcome text NOT NULL,
  similarity_before numeric,
  similarity_after numeric,
  quality_before numeric,
  quality_after numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pcie2_mutation_log TO service_role;
GRANT SELECT ON public.pcie2_mutation_log TO authenticated;
ALTER TABLE public.pcie2_mutation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ml_service" ON public.pcie2_mutation_log;
DROP POLICY IF EXISTS "ml_admin_read" ON public.pcie2_mutation_log;
CREATE POLICY "ml_service" ON public.pcie2_mutation_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ml_admin_read" ON public.pcie2_mutation_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS pcie2_mutation_log_job_idx ON public.pcie2_mutation_log(job_id);
CREATE INDEX IF NOT EXISTS pcie2_mutation_log_created_idx ON public.pcie2_mutation_log(created_at DESC);

CREATE TABLE IF NOT EXISTS public.pcie2_engine_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  creatives_total int NOT NULL DEFAULT 0,
  growth_rate_5min numeric NOT NULL DEFAULT 0,
  avg_similarity numeric NOT NULL DEFAULT 0,
  saturation_index numeric NOT NULL DEFAULT 0,
  queue_depth int NOT NULL DEFAULT 0,
  active_families int NOT NULL DEFAULT 0,
  active_concepts int NOT NULL DEFAULT 0,
  visual_fingerprints int NOT NULL DEFAULT 0,
  mutations_last_hour int NOT NULL DEFAULT 0,
  rejections_last_hour int NOT NULL DEFAULT 0,
  notes text
);
GRANT ALL ON public.pcie2_engine_health TO service_role;
GRANT SELECT ON public.pcie2_engine_health TO authenticated;
ALTER TABLE public.pcie2_engine_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eh_service" ON public.pcie2_engine_health;
DROP POLICY IF EXISTS "eh_admin_read" ON public.pcie2_engine_health;
CREATE POLICY "eh_service" ON public.pcie2_engine_health FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "eh_admin_read" ON public.pcie2_engine_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS pcie2_engine_health_snapshot_idx ON public.pcie2_engine_health(snapshot_at DESC);

ALTER TABLE public.pcie2_creative_jobs
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS visual_fingerprint text,
  ADD COLUMN IF NOT EXISTS concept_node_id uuid,
  ADD COLUMN IF NOT EXISTS mutation_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_mutation_strategy text;

-- Drop pre-existing claim variants then recreate with our standard signature
DROP FUNCTION IF EXISTS public.pcie2_claim_creative_jobs(integer, uuid);
DROP FUNCTION IF EXISTS public.pcie2_claim_creative_jobs(int, uuid);
CREATE OR REPLACE FUNCTION public.pcie2_claim_creative_jobs(p_limit int DEFAULT 8, p_worker uuid DEFAULT gen_random_uuid())
RETURNS SETOF public.pcie2_creative_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.pcie2_creative_jobs j
  SET status='running', claim_token=p_worker, claimed_at=now(), updated_at=now(), attempts=j.attempts+1
  WHERE j.id IN (
    SELECT id FROM public.pcie2_creative_jobs
    WHERE status='queued'
       OR (status='running' AND claimed_at < now() - interval '5 minutes')
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.pcie2_claim_creative_jobs(int, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pcie2_claim_creative_jobs(int, uuid) TO service_role;
