
-- pcie2_pin_performance
CREATE TABLE public.pcie2_pin_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  creative_id uuid NULL REFERENCES public.pcie2_creatives(id) ON DELETE SET NULL,
  product_id uuid NULL,
  product_slug text NULL,
  category text NULL,
  board_id text NULL,
  publish_time timestamptz NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  impressions int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  closeups int NOT NULL DEFAULT 0,
  ctr numeric NULL,
  engagement_rate numeric NULL,
  conversion_value numeric NULL,
  roas numeric NULL,
  creative_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  headline text NULL,
  hook text NULL,
  cta text NULL,
  prompt_version text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, measured_at)
);
CREATE INDEX pcie2_pin_perf_pin_idx ON public.pcie2_pin_performance(pin_id);
CREATE INDEX pcie2_pin_perf_category_idx ON public.pcie2_pin_performance(category);
GRANT SELECT ON public.pcie2_pin_performance TO authenticated;
GRANT ALL ON public.pcie2_pin_performance TO service_role;
ALTER TABLE public.pcie2_pin_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_pin_perf_admin_read" ON public.pcie2_pin_performance FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- pcie2_feature_attribution
CREATE TABLE public.pcie2_feature_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_group text NOT NULL,
  feature_value text NOT NULL,
  metric text NOT NULL,
  correlation numeric NOT NULL DEFAULT 0,
  lift_pct numeric NULL,
  sample_size int NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  reliability text NOT NULL DEFAULT 'insufficient',
  window_days int NOT NULL DEFAULT 30,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_group, feature_value, metric, window_days)
);
GRANT SELECT ON public.pcie2_feature_attribution TO authenticated;
GRANT ALL ON public.pcie2_feature_attribution TO service_role;
ALTER TABLE public.pcie2_feature_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_fa_admin_read" ON public.pcie2_feature_attribution FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- pcie2_insights
CREATE TABLE public.pcie2_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  headline text NOT NULL,
  detail text NULL,
  confidence numeric NOT NULL DEFAULT 0,
  sample_size int NOT NULL DEFAULT 0,
  reliability text NOT NULL DEFAULT 'insufficient',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_insights TO authenticated;
GRANT ALL ON public.pcie2_insights TO service_role;
ALTER TABLE public.pcie2_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_insights_admin_read" ON public.pcie2_insights FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- pcie2_learning_runs
CREATE TABLE public.pcie2_learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  error text NULL
);
GRANT SELECT ON public.pcie2_learning_runs TO authenticated;
GRANT ALL ON public.pcie2_learning_runs TO service_role;
ALTER TABLE public.pcie2_learning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_lr_admin_read" ON public.pcie2_learning_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- pcie2_experiments
CREATE TABLE public.pcie2_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hypothesis text NULL,
  variable text NOT NULL,
  allow_multivariate boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  started_at timestamptz NULL,
  ended_at timestamptz NULL,
  winner_variant_id uuid NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_experiments TO authenticated;
GRANT ALL ON public.pcie2_experiments TO service_role;
ALTER TABLE public.pcie2_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_exp_admin_read" ON public.pcie2_experiments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- pcie2_experiment_variants
CREATE TABLE public.pcie2_experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.pcie2_experiments(id) ON DELETE CASCADE,
  label text NOT NULL,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_size int NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_experiment_variants TO authenticated;
GRANT ALL ON public.pcie2_experiment_variants TO service_role;
ALTER TABLE public.pcie2_experiment_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_ev_admin_read" ON public.pcie2_experiment_variants FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
