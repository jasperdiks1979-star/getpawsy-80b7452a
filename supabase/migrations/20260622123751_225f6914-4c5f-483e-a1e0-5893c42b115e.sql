
-- 1. Config singleton (master kill switch + tunables)
CREATE TABLE public.pinterest_lifestyle_engine_config (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  concepts_per_product INT NOT NULL DEFAULT 5,
  min_accepted_class TEXT NOT NULL DEFAULT 'A' CHECK (min_accepted_class IN ('A','B','C')),
  max_attempts_per_concept INT NOT NULL DEFAULT 2,
  target_a_share NUMERIC NOT NULL DEFAULT 0.80,
  image_model TEXT NOT NULL DEFAULT 'openai/gpt-image-2',
  image_size TEXT NOT NULL DEFAULT '1024x1536',
  image_quality TEXT NOT NULL DEFAULT 'medium',
  vision_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  daily_credit_budget NUMERIC NOT NULL DEFAULT 50,
  pilot_product_limit INT NOT NULL DEFAULT 5,
  estimated_credits_per_image NUMERIC NOT NULL DEFAULT 2.0,
  estimated_credits_per_vision NUMERIC NOT NULL DEFAULT 0.02,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.pinterest_lifestyle_engine_config TO authenticated;
GRANT ALL ON public.pinterest_lifestyle_engine_config TO service_role;
ALTER TABLE public.pinterest_lifestyle_engine_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read engine config"
  ON public.pinterest_lifestyle_engine_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update engine config"
  ON public.pinterest_lifestyle_engine_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.pinterest_lifestyle_engine_config (id, enabled, notes)
VALUES (1, false, 'V3 engine built but disabled. Flip enabled=true to activate after credit top-up.')
ON CONFLICT (id) DO NOTHING;

-- 2. Concepts table
CREATE TABLE public.pinterest_lifestyle_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  product_slug TEXT,
  concept_index INT NOT NULL,
  scene_brief TEXT NOT NULL,
  image_prompt TEXT NOT NULL,
  source_image_url TEXT,
  generated_image_url TEXT,
  generated_image_path TEXT,
  image_model TEXT,
  attempts INT NOT NULL DEFAULT 0,
  quality_class TEXT CHECK (quality_class IN ('A','B','C')),
  vision_score NUMERIC,
  vision_reason TEXT,
  vision_model TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','prompting','rendering','scoring','accepted','rejected','failed','skipped')),
  rejection_reason TEXT,
  credits_spent NUMERIC NOT NULL DEFAULT 0,
  run_id UUID,
  last_error TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, concept_index, run_id)
);

CREATE INDEX idx_lifestyle_concepts_product ON public.pinterest_lifestyle_concepts(product_id);
CREATE INDEX idx_lifestyle_concepts_status  ON public.pinterest_lifestyle_concepts(status);
CREATE INDEX idx_lifestyle_concepts_class   ON public.pinterest_lifestyle_concepts(quality_class);
CREATE INDEX idx_lifestyle_concepts_run     ON public.pinterest_lifestyle_concepts(run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_lifestyle_concepts TO authenticated;
GRANT ALL ON public.pinterest_lifestyle_concepts TO service_role;
ALTER TABLE public.pinterest_lifestyle_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage lifestyle concepts"
  ON public.pinterest_lifestyle_concepts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Runs table
CREATE TABLE public.pinterest_lifestyle_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID,
  mode TEXT NOT NULL DEFAULT 'pilot' CHECK (mode IN ('pilot','full','single_product','dry_run')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','aborted','disabled')),
  product_ids UUID[] NOT NULL DEFAULT '{}',
  concepts_planned INT NOT NULL DEFAULT 0,
  concepts_attempted INT NOT NULL DEFAULT 0,
  concepts_accepted INT NOT NULL DEFAULT 0,
  concepts_rejected INT NOT NULL DEFAULT 0,
  class_a_count INT NOT NULL DEFAULT 0,
  class_b_count INT NOT NULL DEFAULT 0,
  class_c_count INT NOT NULL DEFAULT 0,
  credits_spent NUMERIC NOT NULL DEFAULT 0,
  credits_budget NUMERIC,
  config_snapshot JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lifestyle_runs_status ON public.pinterest_lifestyle_runs(status);
CREATE INDEX idx_lifestyle_runs_created ON public.pinterest_lifestyle_runs(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.pinterest_lifestyle_runs TO authenticated;
GRANT ALL ON public.pinterest_lifestyle_runs TO service_role;
ALTER TABLE public.pinterest_lifestyle_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage lifestyle runs"
  ON public.pinterest_lifestyle_runs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at triggers
CREATE TRIGGER trg_lifestyle_concepts_updated
  BEFORE UPDATE ON public.pinterest_lifestyle_concepts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_lifestyle_runs_updated
  BEFORE UPDATE ON public.pinterest_lifestyle_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_lifestyle_engine_config_updated
  BEFORE UPDATE ON public.pinterest_lifestyle_engine_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
