
-- Growth Lab (Phase 12) — experimentation layer
CREATE TABLE IF NOT EXISTS public.growth_lab_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hypothesis text NOT NULL,
  category text NOT NULL,
  surface text,
  variant_a jsonb NOT NULL DEFAULT '{}'::jsonb,
  variant_b jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_metric text NOT NULL,
  failure_metric text,
  expected_revenue_cents integer DEFAULT 0,
  expected_conversion_lift numeric DEFAULT 0,
  confidence_target numeric DEFAULT 0.95,
  min_sample_size integer DEFAULT 200,
  status text NOT NULL DEFAULT 'draft',
  outcome text,
  winner text,
  evidence jsonb DEFAULT '{}'::jsonb,
  lessons text,
  affected_ids jsonb DEFAULT '[]'::jsonb,
  source text DEFAULT 'discovery',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_lab_experiments TO authenticated;
GRANT ALL ON public.growth_lab_experiments TO service_role;
ALTER TABLE public.growth_lab_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_exp_admin_all" ON public.growth_lab_experiments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "lab_exp_service" ON public.growth_lab_experiments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.growth_lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.growth_lab_experiments(id) ON DELETE CASCADE,
  variant text NOT NULL,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  saves integer DEFAULT 0,
  add_to_cart integer DEFAULT 0,
  checkouts integer DEFAULT 0,
  purchases integer DEFAULT 0,
  revenue_cents integer DEFAULT 0,
  ctr numeric,
  cvr numeric,
  rpv_cents numeric,
  confidence numeric,
  p_value numeric,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_lab_results TO authenticated;
GRANT ALL ON public.growth_lab_results TO service_role;
ALTER TABLE public.growth_lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_res_admin_all" ON public.growth_lab_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "lab_res_service" ON public.growth_lab_results FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.growth_lab_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid REFERENCES public.growth_lab_experiments(id) ON DELETE SET NULL,
  pattern_key text NOT NULL,
  pattern_type text NOT NULL,
  verdict text NOT NULL,
  confidence numeric DEFAULT 0,
  evidence jsonb DEFAULT '{}'::jsonb,
  revenue_delta_cents integer DEFAULT 0,
  conversion_delta numeric DEFAULT 0,
  lessons text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lab_knowledge_pattern_uniq ON public.growth_lab_knowledge(pattern_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_lab_knowledge TO authenticated;
GRANT ALL ON public.growth_lab_knowledge TO service_role;
ALTER TABLE public.growth_lab_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_kno_admin_all" ON public.growth_lab_knowledge FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "lab_kno_service" ON public.growth_lab_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.growth_lab_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  stats jsonb DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_lab_runs TO authenticated;
GRANT ALL ON public.growth_lab_runs TO service_role;
ALTER TABLE public.growth_lab_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_run_admin_all" ON public.growth_lab_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "lab_run_service" ON public.growth_lab_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_lab_exp_updated BEFORE UPDATE ON public.growth_lab_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
