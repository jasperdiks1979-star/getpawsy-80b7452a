
CREATE EXTENSION IF NOT EXISTS vector;

-- Headline library extensions
ALTER TABLE public.pcie2_headline_library
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS reading_grade numeric,
  ADD COLUMN IF NOT EXISTS length integer,
  ADD COLUMN IF NOT EXISTS predicted_ctr numeric,
  ADD COLUMN IF NOT EXISTS duplicate_score numeric,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS source_category text,
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS pcie2_headline_family_idx ON public.pcie2_headline_library (family, retired);
CREATE INDEX IF NOT EXISTS pcie2_headline_category_idx ON public.pcie2_headline_library (source_category, retired);

-- Hook library extensions
ALTER TABLE public.pcie2_hook_library
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS board_id text,
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS predicted_ctr numeric,
  ADD COLUMN IF NOT EXISTS novelty_score numeric,
  ADD COLUMN IF NOT EXISTS duplicate_score numeric,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS engagement_prediction numeric,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS pcie2_hook_product_idx ON public.pcie2_hook_library (product_id, retired);
CREATE INDEX IF NOT EXISTS pcie2_hook_class_idx ON public.pcie2_hook_library (category, retired);

-- Creative extensions
ALTER TABLE public.pcie2_creatives
  ADD COLUMN IF NOT EXISTS concept text,
  ADD COLUMN IF NOT EXISTS layout text,
  ADD COLUMN IF NOT EXISTS pet_pose text,
  ADD COLUMN IF NOT EXISTS headline_id uuid,
  ADD COLUMN IF NOT EXISTS hook_id uuid,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS predicted_ctr numeric,
  ADD COLUMN IF NOT EXISTS pinterest_score numeric,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS duplicate_score numeric,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS evolution_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS pcie2_creatives_concept_idx ON public.pcie2_creatives (product_id, concept, status);

-- Model versions registry
CREATE TABLE IF NOT EXISTS public.pcie2_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_model_versions TO authenticated;
GRANT ALL ON public.pcie2_model_versions TO service_role;
ALTER TABLE public.pcie2_model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_mv_admin_read" ON public.pcie2_model_versions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE INDEX IF NOT EXISTS pcie2_mv_module_idx ON public.pcie2_model_versions (module, is_active);

INSERT INTO public.pcie2_model_versions (module, model, prompt_version, metadata) VALUES
  ('headline_engine','google/gemini-3-flash-preview','headline.v1','{"families":22}'::jsonb),
  ('hook_engine','google/gemini-3-flash-preview','hook.v1','{}'::jsonb),
  ('creative_engine','google/gemini-3-flash-preview','creative.v1','{"concepts":15}'::jsonb),
  ('embedding','openai/text-embedding-3-small','embed.v1','{"dimensions":1536}'::jsonb)
ON CONFLICT DO NOTHING;
