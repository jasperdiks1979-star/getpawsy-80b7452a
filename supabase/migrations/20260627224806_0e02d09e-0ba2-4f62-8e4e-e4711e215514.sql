
CREATE TABLE IF NOT EXISTS public.organic_intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  target_order_id uuid,
  target_label text,
  steps_completed int NOT NULL DEFAULT 0,
  steps_total int NOT NULL DEFAULT 10,
  step_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms int,
  triggered_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organic_intelligence_runs TO authenticated;
GRANT ALL ON public.organic_intelligence_runs TO service_role;
ALTER TABLE public.organic_intelligence_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view OI runs" ON public.organic_intelligence_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.organic_sale_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.organic_intelligence_runs(id) ON DELETE CASCADE,
  order_id uuid,
  order_label text,
  is_verified_organic boolean NOT NULL DEFAULT false,
  funnel_stages jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  why_converted text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organic_sale_attribution TO authenticated;
GRANT ALL ON public.organic_sale_attribution TO service_role;
ALTER TABLE public.organic_sale_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view OI attribution" ON public.organic_sale_attribution FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.organic_success_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.organic_intelligence_runs(id) ON DELETE SET NULL,
  sample_size int NOT NULL DEFAULT 0,
  dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  similar_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  similar_creatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organic_success_dna TO authenticated;
GRANT ALL ON public.organic_success_dna TO service_role;
ALTER TABLE public.organic_success_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view OI DNA" ON public.organic_success_dna FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.organic_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.organic_intelligence_runs(id) ON DELETE CASCADE,
  target_label text,
  summary text,
  report_md text,
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organic_intelligence_reports TO authenticated;
GRANT ALL ON public.organic_intelligence_reports TO service_role;
ALTER TABLE public.organic_intelligence_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view OI reports" ON public.organic_intelligence_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_oi_runs_created ON public.organic_intelligence_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oi_attr_order ON public.organic_sale_attribution(order_id);
CREATE INDEX IF NOT EXISTS idx_oi_reports_run ON public.organic_intelligence_reports(run_id);
