
-- Genesis V6.1 Conversion Intelligence (GCI) — orchestration layer (no duplicate logic)
CREATE TABLE IF NOT EXISTS public.gci_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_slug text,
  product_name text,
  crs numeric NOT NULL DEFAULT 0,          -- Conversion Readiness Score 0-100
  trust_score numeric NOT NULL DEFAULT 0,
  mobile_score numeric NOT NULL DEFAULT 0,
  image_score numeric NOT NULL DEFAULT 0,
  copy_score numeric NOT NULL DEFAULT 0,
  signal_score numeric NOT NULL DEFAULT 0,
  expected_revenue_lift numeric NOT NULL DEFAULT 0,
  expected_conv_lift numeric NOT NULL DEFAULT 0,
  frictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);
GRANT SELECT ON public.gci_scores TO authenticated;
GRANT ALL ON public.gci_scores TO service_role;
ALTER TABLE public.gci_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gci_scores admin read" ON public.gci_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS gci_scores_crs_idx ON public.gci_scores (crs DESC);
CREATE INDEX IF NOT EXISTS gci_scores_lift_idx ON public.gci_scores (expected_revenue_lift DESC);

CREATE TABLE IF NOT EXISTS public.gci_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  products_analyzed int NOT NULL DEFAULT 0,
  products_improved int NOT NULL DEFAULT 0,
  avg_crs numeric,
  avg_trust numeric,
  total_expected_revenue_lift numeric,
  first_sale_eta_hours numeric,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gci_runs TO authenticated;
GRANT ALL ON public.gci_runs TO service_role;
ALTER TABLE public.gci_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gci_runs admin read" ON public.gci_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
