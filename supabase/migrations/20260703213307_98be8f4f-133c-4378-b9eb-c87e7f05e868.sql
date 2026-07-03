
-- Phase 20 — Product Identity Graph (PIG) / Visual Truth Engine
-- Canonical identity graph: every image/video/pin/creative/cj/hero/gallery becomes a node
-- linked to a product node with immutable Visual DNA and certification state.

-- Node kinds (products, images, videos, pins, creatives, cj_images, gallery, hero)
DO $$ BEGIN
  CREATE TYPE public.pig_node_kind AS ENUM (
    'product','image','video','pinterest_pin','ai_creative','cj_image',
    'gallery_image','hero_image','pdp_image'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pig_match_kind AS ENUM (
    'exact','variant','family','wrong','duplicate','unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pig_edge_kind AS ENUM (
    'belongs_to','variant_of','duplicate_of','hero_of','gallery_of',
    'pinterest_of','video_of','ai_creative_of','cj_original_of','represents'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nodes
CREATE TABLE IF NOT EXISTS public.pig_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind public.pig_node_kind NOT NULL,
  product_id UUID,
  external_id TEXT,          -- pinterest_pin_id / cj_image_id / creative id / etc
  source TEXT,               -- 'products','pinterest_pin_queue','cj','pei','media_audit', ...
  url TEXT,                  -- canonical asset URL (for image/video/pin/creative)
  content_hash TEXT,         -- pHash / sha of url
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pig_nodes_kind_idx ON public.pig_nodes(kind);
CREATE INDEX IF NOT EXISTS pig_nodes_product_idx ON public.pig_nodes(product_id);
CREATE INDEX IF NOT EXISTS pig_nodes_url_idx ON public.pig_nodes(url);
CREATE INDEX IF NOT EXISTS pig_nodes_hash_idx ON public.pig_nodes(content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS pig_nodes_unique_url_kind
  ON public.pig_nodes(kind, url) WHERE url IS NOT NULL;
GRANT SELECT ON public.pig_nodes TO authenticated;
GRANT ALL ON public.pig_nodes TO service_role;
ALTER TABLE public.pig_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_nodes admin read" ON public.pig_nodes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_nodes service write" ON public.pig_nodes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Edges
CREATE TABLE IF NOT EXISTS public.pig_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_node UUID NOT NULL REFERENCES public.pig_nodes(id) ON DELETE CASCADE,
  to_node   UUID NOT NULL REFERENCES public.pig_nodes(id) ON DELETE CASCADE,
  kind public.pig_edge_kind NOT NULL,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pig_edges_unique ON public.pig_edges(from_node,to_node,kind);
CREATE INDEX IF NOT EXISTS pig_edges_to_idx ON public.pig_edges(to_node);
GRANT SELECT ON public.pig_edges TO authenticated;
GRANT ALL ON public.pig_edges TO service_role;
ALTER TABLE public.pig_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_edges admin read" ON public.pig_edges FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_edges service write" ON public.pig_edges FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Visual DNA (one row per image/video node) — immutable per url/hash
CREATE TABLE IF NOT EXISTS public.pig_visual_dna (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id UUID NOT NULL UNIQUE REFERENCES public.pig_nodes(id) ON DELETE CASCADE,
  perceptual_hash TEXT,
  dominant_colors JSONB,        -- [{hex,ratio}]
  palette_key TEXT,
  shape_signature TEXT,
  material_tags TEXT[],
  species TEXT,
  furniture_kind TEXT,
  platform_count INT,
  height_ratio NUMERIC(6,3),
  width_ratio NUMERIC(6,3),
  environment TEXT,
  composition TEXT,
  camera TEXT,
  lighting TEXT,
  usage TEXT,
  axes JSONB,                   -- full VPI axis snapshot when derived from vision
  vision_model TEXT,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pig_dna_hash_idx ON public.pig_visual_dna(perceptual_hash);
CREATE INDEX IF NOT EXISTS pig_dna_palette_idx ON public.pig_visual_dna(palette_key);
GRANT SELECT ON public.pig_visual_dna TO authenticated;
GRANT ALL ON public.pig_visual_dna TO service_role;
ALTER TABLE public.pig_visual_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_dna admin read" ON public.pig_visual_dna FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_dna service write" ON public.pig_visual_dna FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Certifications (per product-image relationship — asset X is certified for product P as kind Y)
CREATE TABLE IF NOT EXISTS public.pig_certifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  node_id UUID NOT NULL REFERENCES public.pig_nodes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,           -- 'hero','gallery','pinterest_hero','video','ai_creative','cj_original'
  match_kind public.pig_match_kind NOT NULL DEFAULT 'exact',
  identity_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  pre_score NUMERIC(6,2),
  quality_score NUMERIC(6,2),
  revenue_risk NUMERIC(6,2) NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  certified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pig_cert_unique ON public.pig_certifications(product_id,node_id,role);
CREATE INDEX IF NOT EXISTS pig_cert_product_idx ON public.pig_certifications(product_id);
CREATE INDEX IF NOT EXISTS pig_cert_passed_idx ON public.pig_certifications(passed);
GRANT SELECT ON public.pig_certifications TO authenticated;
GRANT ALL ON public.pig_certifications TO service_role;
ALTER TABLE public.pig_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_cert admin read" ON public.pig_certifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_cert service write" ON public.pig_certifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Duplicate registry
CREATE TABLE IF NOT EXISTS public.pig_duplicates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  primary_node UUID NOT NULL REFERENCES public.pig_nodes(id) ON DELETE CASCADE,
  duplicate_node UUID NOT NULL REFERENCES public.pig_nodes(id) ON DELETE CASCADE,
  similarity NUMERIC(6,3) NOT NULL DEFAULT 1,
  method TEXT NOT NULL DEFAULT 'phash',
  merged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pig_dup_unique ON public.pig_duplicates(primary_node,duplicate_node);
GRANT SELECT ON public.pig_duplicates TO authenticated;
GRANT ALL ON public.pig_duplicates TO service_role;
ALTER TABLE public.pig_duplicates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_dup admin read" ON public.pig_duplicates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_dup service write" ON public.pig_duplicates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Runs (orchestrator sweeps)
CREATE TABLE IF NOT EXISTS public.pig_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_kind TEXT NOT NULL,       -- 'ingest','dna','certify','duplicates','heal','full'
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by TEXT
);
CREATE INDEX IF NOT EXISTS pig_runs_started_idx ON public.pig_runs(started_at DESC);
GRANT SELECT ON public.pig_runs TO authenticated;
GRANT ALL ON public.pig_runs TO service_role;
ALTER TABLE public.pig_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_runs admin read" ON public.pig_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_runs service write" ON public.pig_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Settings
CREATE TABLE IF NOT EXISTS public.pig_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pig_settings TO authenticated;
GRANT ALL ON public.pig_settings TO service_role;
ALTER TABLE public.pig_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pig_settings admin read" ON public.pig_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pig_settings service write" ON public.pig_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.pig_settings(key,value) VALUES
  ('enabled','true'::jsonb),
  ('min_identity_score','99'::jsonb),
  ('block_publish_on_fail','true'::jsonb),
  ('auto_hero_promote','true'::jsonb),
  ('duplicate_phash_threshold','6'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pig_touch_updated() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS pig_nodes_touch ON public.pig_nodes;
CREATE TRIGGER pig_nodes_touch BEFORE UPDATE ON public.pig_nodes
  FOR EACH ROW EXECUTE FUNCTION public.pig_touch_updated();
DROP TRIGGER IF EXISTS pig_dna_touch ON public.pig_visual_dna;
CREATE TRIGGER pig_dna_touch BEFORE UPDATE ON public.pig_visual_dna
  FOR EACH ROW EXECUTE FUNCTION public.pig_touch_updated();
DROP TRIGGER IF EXISTS pig_cert_touch ON public.pig_certifications;
CREATE TRIGGER pig_cert_touch BEFORE UPDATE ON public.pig_certifications
  FOR EACH ROW EXECUTE FUNCTION public.pig_touch_updated();
