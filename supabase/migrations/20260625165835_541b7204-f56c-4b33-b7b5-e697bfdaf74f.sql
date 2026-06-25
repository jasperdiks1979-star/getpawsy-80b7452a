
CREATE TABLE public.pin_wave1_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  products_total int NOT NULL DEFAULT 0,
  products_classified int NOT NULL DEFAULT 0,
  products_failed int NOT NULL DEFAULT 0,
  hooks_registered int NOT NULL DEFAULT 0,
  restrictions_registered int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pin_wave1_runs TO authenticated;
GRANT ALL ON public.pin_wave1_runs TO service_role;
ALTER TABLE public.pin_wave1_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read wave1 runs" ON public.pin_wave1_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pin_product_understanding (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  primary_species text,
  product_type text,
  use_case text,
  audience text,
  key_attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'rule',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pin_product_understanding TO authenticated;
GRANT ALL ON public.pin_product_understanding TO service_role;
ALTER TABLE public.pin_product_understanding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read understanding" ON public.pin_product_understanding FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pin_product_classification (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  taxonomy text NOT NULL,
  subtaxonomy text,
  allowed_hook_ids text[] NOT NULL DEFAULT '{}',
  banned_hook_ids text[] NOT NULL DEFAULT '{}',
  rationale text,
  confidence numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pin_product_classification TO authenticated;
GRANT ALL ON public.pin_product_classification TO service_role;
ALTER TABLE public.pin_product_classification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read classification" ON public.pin_product_classification FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pin_hook_library (
  hook_id text PRIMARY KEY,
  title text NOT NULL,
  template text NOT NULL,
  taxonomy text NOT NULL,
  tone text,
  required_attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pin_hook_library TO authenticated;
GRANT ALL ON public.pin_hook_library TO service_role;
ALTER TABLE public.pin_hook_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read hooks" ON public.pin_hook_library FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pin_hook_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy text NOT NULL,
  rule_type text NOT NULL,
  pattern text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.pin_hook_restrictions(taxonomy);
GRANT SELECT ON public.pin_hook_restrictions TO authenticated;
GRANT ALL ON public.pin_hook_restrictions TO service_role;
ALTER TABLE public.pin_hook_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read restrictions" ON public.pin_hook_restrictions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
