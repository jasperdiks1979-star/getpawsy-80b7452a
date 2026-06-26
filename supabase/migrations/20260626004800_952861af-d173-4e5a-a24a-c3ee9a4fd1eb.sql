
-- PCIE2 Wave 1: Creative Memory + Product Understanding foundation
-- All tables additive, admin-read via has_role('admin'), service_role full.

CREATE TABLE public.pcie2_product_understanding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  functional_class text NOT NULL,
  sub_class text,
  primary_purpose text,
  use_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  pain_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  psychology_model jsonb NOT NULL DEFAULT '{}'::jsonb,
  banned_hook_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  classifier_model text,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_product_understanding TO authenticated;
GRANT ALL ON public.pcie2_product_understanding TO service_role;
ALTER TABLE public.pcie2_product_understanding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_pu_admin_read" ON public.pcie2_product_understanding
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pcie2_headline_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  functional_class text NOT NULL,
  sub_class text,
  headline text NOT NULL,
  hook_type text,
  emotion text,
  ngram_signature text,
  use_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  performance_score numeric DEFAULT 0,
  retired boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'seed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (functional_class, headline)
);
CREATE INDEX pcie2_headline_class_idx ON public.pcie2_headline_library (functional_class, retired);
GRANT SELECT ON public.pcie2_headline_library TO authenticated;
GRANT ALL ON public.pcie2_headline_library TO service_role;
ALTER TABLE public.pcie2_headline_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_hl_admin_read" ON public.pcie2_headline_library
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pcie2_hook_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  functional_class text NOT NULL,
  hook text NOT NULL,
  hook_type text,
  rationale text,
  use_count int NOT NULL DEFAULT 0,
  performance_score numeric DEFAULT 0,
  retired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (functional_class, hook)
);
GRANT SELECT ON public.pcie2_hook_library TO authenticated;
GRANT ALL ON public.pcie2_hook_library TO service_role;
ALTER TABLE public.pcie2_hook_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_hk_admin_read" ON public.pcie2_hook_library
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pcie2_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  category text,
  board_id text,
  headline text,
  hook text,
  body_text text,
  cta text,
  prompt text,
  negative_prompt text,
  visual_style text,
  lighting text,
  camera_angle text,
  composition text,
  background text,
  color_palette jsonb,
  primary_emotion text,
  secondary_emotion text,
  story_type text,
  animal_breed text,
  typography text,
  font_size numeric,
  product_visibility_score numeric,
  brand_visibility_score numeric,
  safe_zone_score numeric,
  image_url text,
  image_hash text,
  perceptual_hash text,
  embedding_ref uuid,
  creative_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  pinterest_pin_id text,
  performance jsonb NOT NULL DEFAULT '{}'::jsonb,
  retired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pcie2_creatives_product_idx ON public.pcie2_creatives (product_id);
CREATE INDEX pcie2_creatives_status_idx ON public.pcie2_creatives (status, retired);
CREATE INDEX pcie2_creatives_hash_idx ON public.pcie2_creatives (perceptual_hash);
GRANT SELECT ON public.pcie2_creatives TO authenticated;
GRANT ALL ON public.pcie2_creatives TO service_role;
ALTER TABLE public.pcie2_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_cr_admin_read" ON public.pcie2_creatives
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pcie2_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.pcie2_runs TO authenticated;
GRANT ALL ON public.pcie2_runs TO service_role;
ALTER TABLE public.pcie2_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_runs_admin_read" ON public.pcie2_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated-at trigger reuse
CREATE TRIGGER pcie2_pu_updated BEFORE UPDATE ON public.pcie2_product_understanding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pcie2_hl_updated BEFORE UPDATE ON public.pcie2_headline_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pcie2_hk_updated BEFORE UPDATE ON public.pcie2_hook_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pcie2_cr_updated BEFORE UPDATE ON public.pcie2_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Feature flag (additive, off by default)
INSERT INTO public.app_config (key, value)
VALUES ('pcie2_publish_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
