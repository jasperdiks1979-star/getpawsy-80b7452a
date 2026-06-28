
CREATE TABLE IF NOT EXISTS public.pcie_v2_render_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, display_name text NOT NULL, handler text NOT NULL,
  model text, priority int NOT NULL DEFAULT 100, max_retries int NOT NULL DEFAULT 2,
  enabled boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_render_providers TO authenticated;
GRANT ALL ON public.pcie_v2_render_providers TO service_role;
ALTER TABLE public.pcie_v2_render_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read providers" ON public.pcie_v2_render_providers;
CREATE POLICY "admin read providers" ON public.pcie_v2_render_providers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.pcie_v2_render_providers (slug, display_name, handler, model, priority) VALUES
  ('lovable_gemini_flash_image', 'Lovable / Gemini 3.1 Flash Image', 'lovable_image', 'google/gemini-3.1-flash-image', 10),
  ('lovable_gemini_pro_image',   'Lovable / Gemini 3 Pro Image',     'lovable_image', 'google/gemini-3-pro-image',     20),
  ('lovable_gpt_image_2',        'Lovable / GPT Image 2',            'lovable_image', 'openai/gpt-image-2',            30)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pcie_v2_candidate_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, product_slug text, niche text,
  requested int NOT NULL, winner_creative_id uuid, winner_score numeric,
  dry_run boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_candidate_sets TO authenticated;
GRANT ALL ON public.pcie_v2_candidate_sets TO service_role;
ALTER TABLE public.pcie_v2_candidate_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read candidate sets" ON public.pcie_v2_candidate_sets;
CREATE POLICY "admin read candidate sets" ON public.pcie_v2_candidate_sets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie_v2_render_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creative_id uuid, candidate_set_id uuid,
  provider_slug text NOT NULL, model text, attempt_no int NOT NULL DEFAULT 1, status text NOT NULL,
  duration_ms int, seed text, render_settings jsonb DEFAULT '{}'::jsonb,
  image_url text, image_fingerprint text, error text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_render_attempts TO authenticated;
GRANT ALL ON public.pcie_v2_render_attempts TO service_role;
ALTER TABLE public.pcie_v2_render_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read render attempts" ON public.pcie_v2_render_attempts;
CREATE POLICY "admin read render attempts" ON public.pcie_v2_render_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pcie_v2_render_attempts_creative ON public.pcie_v2_render_attempts(creative_id);

CREATE TABLE IF NOT EXISTS public.pcie_v2_prompt_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creative_id uuid NOT NULL, check_slug text NOT NULL,
  passed boolean NOT NULL, severity text NOT NULL DEFAULT 'hard', detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_prompt_qa TO authenticated;
GRANT ALL ON public.pcie_v2_prompt_qa TO service_role;
ALTER TABLE public.pcie_v2_prompt_qa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read prompt qa" ON public.pcie_v2_prompt_qa;
CREATE POLICY "admin read prompt qa" ON public.pcie_v2_prompt_qa FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie_v2_render_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creative_id uuid NOT NULL, render_attempt_id uuid,
  check_slug text NOT NULL, passed boolean NOT NULL, score numeric, detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_render_qa TO authenticated;
GRANT ALL ON public.pcie_v2_render_qa TO service_role;
ALTER TABLE public.pcie_v2_render_qa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read render qa" ON public.pcie_v2_render_qa;
CREATE POLICY "admin read render qa" ON public.pcie_v2_render_qa FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.pcie_v2_creatives
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_fingerprint text,
  ADD COLUMN IF NOT EXISTS seed text,
  ADD COLUMN IF NOT EXISTS provider_slug text,
  ADD COLUMN IF NOT EXISTS render_settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_set_id uuid,
  ADD COLUMN IF NOT EXISTS replay_of_creative_id uuid,
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS render_status text;

INSERT INTO public.pcie_v2_pipeline_stages (slug, name, handler, order_index, enabled) VALUES
  ('prompt_qa',    'Prompt QA',    'prompt_qa',    65, true),
  ('brand_safety', 'Brand Safety', 'brand_safety', 75, true),
  ('image_render', 'Image Render', 'image_render', 80, true),
  ('render_qa',    'Render QA',    'render_qa',    85, true)
ON CONFLICT (slug) DO UPDATE SET handler=EXCLUDED.handler, order_index=EXCLUDED.order_index, enabled=EXCLUDED.enabled, name=EXCLUDED.name;

INSERT INTO public.pcie_v2_config (key, value) VALUES
  ('candidates_per_run',    '3'::jsonb),
  ('render_max_retries',    '2'::jsonb),
  ('dry_run_default',       'false'::jsonb),
  ('render_qa_min_score',   '70'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcie_v2_feature_flags (flag, enabled) VALUES
  ('pcie_v2_image_render',    true),
  ('pcie_v2_render_qa',       true),
  ('pcie_v2_brand_safety',    true),
  ('pcie_v2_multi_candidate', true)
ON CONFLICT (flag) DO NOTHING;
