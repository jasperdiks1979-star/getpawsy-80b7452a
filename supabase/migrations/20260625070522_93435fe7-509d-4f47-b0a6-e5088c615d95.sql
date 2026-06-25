
-- ========== Creative Production Engine V1 ==========

-- 1. cpe_pipeline_runs
CREATE TABLE IF NOT EXISTS public.cpe_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger text,
  phases_run jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_cost_usd numeric NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  dry_run boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.cpe_pipeline_runs TO authenticated;
GRANT ALL ON public.cpe_pipeline_runs TO service_role;
ALTER TABLE public.cpe_pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_runs_admin_read" ON public.cpe_pipeline_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. cpe_asset_versions
CREATE TABLE IF NOT EXISTS public.cpe_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid,
  product_id uuid,
  source_url text NOT NULL,
  sha256 text,
  bytes bigint,
  width int,
  height int,
  is_current boolean NOT NULL DEFAULT true,
  supersedes_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'cj'
);
CREATE INDEX IF NOT EXISTS cpe_asset_versions_asset_idx ON public.cpe_asset_versions(asset_id);
CREATE INDEX IF NOT EXISTS cpe_asset_versions_sha_idx ON public.cpe_asset_versions(sha256);
GRANT SELECT ON public.cpe_asset_versions TO authenticated;
GRANT ALL ON public.cpe_asset_versions TO service_role;
ALTER TABLE public.cpe_asset_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_versions_admin_read" ON public.cpe_asset_versions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. cpe_enhanced_images
CREATE TABLE IF NOT EXISTS public.cpe_enhanced_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid,
  product_id uuid,
  original_url text NOT NULL,
  enhanced_url text,
  premium_url text,
  quality_score int,
  model text,
  cost_usd numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  scored_at timestamptz
);
CREATE INDEX IF NOT EXISTS cpe_enh_product_idx ON public.cpe_enhanced_images(product_id);
CREATE INDEX IF NOT EXISTS cpe_enh_status_idx ON public.cpe_enhanced_images(status);
GRANT SELECT ON public.cpe_enhanced_images TO authenticated;
GRANT ALL ON public.cpe_enhanced_images TO service_role;
ALTER TABLE public.cpe_enhanced_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_enh_admin_read" ON public.cpe_enhanced_images FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. cpe_lifestyle_scenes
CREATE TABLE IF NOT EXISTS public.cpe_lifestyle_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  scene_family text NOT NULL,
  prompt text,
  prompt_hash text,
  image_url text,
  anatomy_score int,
  quality_score int,
  status text NOT NULL DEFAULT 'pending',
  model text,
  cost_usd numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cpe_life_product_idx ON public.cpe_lifestyle_scenes(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS cpe_life_dedupe_idx ON public.cpe_lifestyle_scenes(product_id, scene_family, prompt_hash);
GRANT SELECT ON public.cpe_lifestyle_scenes TO authenticated;
GRANT ALL ON public.cpe_lifestyle_scenes TO service_role;
ALTER TABLE public.cpe_lifestyle_scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_life_admin_read" ON public.cpe_lifestyle_scenes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. cpe_creative_jobs
CREATE TABLE IF NOT EXISTS public.cpe_creative_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cpe_jobs_dedupe_idx ON public.cpe_creative_jobs(kind, dedupe_key);
CREATE INDEX IF NOT EXISTS cpe_jobs_queue_idx ON public.cpe_creative_jobs(status, kind, run_at);
GRANT SELECT ON public.cpe_creative_jobs TO authenticated;
GRANT ALL ON public.cpe_creative_jobs TO service_role;
ALTER TABLE public.cpe_creative_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_jobs_admin_read" ON public.cpe_creative_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. cpe_qa_results
CREATE TABLE IF NOT EXISTS public.cpe_qa_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL,
  target_id uuid NOT NULL,
  product_id uuid,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  pass boolean NOT NULL DEFAULT false,
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  score int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cpe_qa_target_idx ON public.cpe_qa_results(target_kind, target_id);
GRANT SELECT ON public.cpe_qa_results TO authenticated;
GRANT ALL ON public.cpe_qa_results TO service_role;
ALTER TABLE public.cpe_qa_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_qa_admin_read" ON public.cpe_qa_results FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. cpe_performance_weights
CREATE TABLE IF NOT EXISTS public.cpe_performance_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  value text NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  sample_n int NOT NULL DEFAULT 0,
  win_rate numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cpe_weights_uniq ON public.cpe_performance_weights(dimension, value);
GRANT SELECT ON public.cpe_performance_weights TO authenticated;
GRANT ALL ON public.cpe_performance_weights TO service_role;
ALTER TABLE public.cpe_performance_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_weights_admin_read" ON public.cpe_performance_weights FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. cpe_settings (singleton id=1)
CREATE TABLE IF NOT EXISTS public.cpe_settings (
  id int PRIMARY KEY DEFAULT 1,
  auto_enhance boolean NOT NULL DEFAULT true,
  auto_lifestyle boolean NOT NULL DEFAULT false,
  auto_video boolean NOT NULL DEFAULT false,
  auto_publish boolean NOT NULL DEFAULT false,
  daily_ai_budget_usd numeric NOT NULL DEFAULT 10,
  max_lifestyle_per_product int NOT NULL DEFAULT 4,
  max_pinterest_per_product int NOT NULL DEFAULT 6,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cpe_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.cpe_settings TO authenticated;
GRANT ALL ON public.cpe_settings TO service_role;
ALTER TABLE public.cpe_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_settings_admin_read" ON public.cpe_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.cpe_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Additive columns (idempotent)
ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS quality_score int,
  ADD COLUMN IF NOT EXISTS qa_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enhanced_image_id uuid,
  ADD COLUMN IF NOT EXISTS lifestyle_scene_id uuid,
  ADD COLUMN IF NOT EXISTS winner_weight numeric;

ALTER TABLE public.cj_media_asset_registry
  ADD COLUMN IF NOT EXISTS current_version_id uuid,
  ADD COLUMN IF NOT EXISTS last_delta_check_at timestamptz;
