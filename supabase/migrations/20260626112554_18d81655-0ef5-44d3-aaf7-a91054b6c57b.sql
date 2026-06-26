
-- 1. RUNS
CREATE TABLE public.pqif_v4_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_runs TO authenticated;
GRANT ALL ON public.pqif_v4_runs TO service_role;
ALTER TABLE public.pqif_v4_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 runs" ON public.pqif_v4_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 2. STRATEGIES
CREATE TABLE public.pqif_v4_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hypothesis text,
  family text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed',
  score numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_strategies TO authenticated;
GRANT ALL ON public.pqif_v4_strategies TO service_role;
ALTER TABLE public.pqif_v4_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 strategies" ON public.pqif_v4_strategies FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 3. EXPERIMENTS
CREATE TABLE public.pqif_v4_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid REFERENCES public.pqif_v4_strategies(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_variant text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_experiments TO authenticated;
GRANT ALL ON public.pqif_v4_experiments TO service_role;
ALTER TABLE public.pqif_v4_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 experiments" ON public.pqif_v4_experiments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 4. PRODUCT RANKS
CREATE TABLE public.pqif_v4_product_ranks (
  product_id uuid NOT NULL,
  run_date date NOT NULL,
  revenue_potential numeric NOT NULL DEFAULT 0,
  rank int NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, run_date)
);
GRANT SELECT ON public.pqif_v4_product_ranks TO authenticated;
GRANT ALL ON public.pqif_v4_product_ranks TO service_role;
ALTER TABLE public.pqif_v4_product_ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 ranks" ON public.pqif_v4_product_ranks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 5. RETIRED PINS
CREATE TABLE public.pqif_v4_retired_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text,
  product_id uuid,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  retired_in_db boolean NOT NULL DEFAULT true,
  retired_on_pinterest boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_retired_pins TO authenticated;
GRANT ALL ON public.pqif_v4_retired_pins TO service_role;
ALTER TABLE public.pqif_v4_retired_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 retired" ON public.pqif_v4_retired_pins FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 6. REGENERATION QUEUE
CREATE TABLE public.pqif_v4_regeneration_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  replaces_pin_id text,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_regeneration_queue TO authenticated;
GRANT ALL ON public.pqif_v4_regeneration_queue TO service_role;
ALTER TABLE public.pqif_v4_regeneration_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 regen" ON public.pqif_v4_regeneration_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 7. DECISIONS
CREATE TABLE public.pqif_v4_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pqif_v4_runs(id) ON DELETE SET NULL,
  decision_type text NOT NULL,
  subject_type text,
  subject_id text,
  verdict text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_decisions TO authenticated;
GRANT ALL ON public.pqif_v4_decisions TO service_role;
ALTER TABLE public.pqif_v4_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 decisions" ON public.pqif_v4_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 8. SETTINGS (singleton)
CREATE TABLE public.pqif_v4_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  publishing_enabled boolean NOT NULL DEFAULT false,
  paid_ads_enabled boolean NOT NULL DEFAULT false,
  daily_ai_budget_usd numeric NOT NULL DEFAULT 75,
  retire_min_impressions int NOT NULL DEFAULT 500,
  retire_max_ctr numeric NOT NULL DEFAULT 0.0025,
  weak_score_threshold numeric NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_v4_settings TO authenticated;
GRANT ALL ON public.pqif_v4_settings TO service_role;
ALTER TABLE public.pqif_v4_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 settings" ON public.pqif_v4_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.pqif_v4_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE INDEX idx_v4_runs_started ON public.pqif_v4_runs (started_at DESC);
CREATE INDEX idx_v4_decisions_run ON public.pqif_v4_decisions (run_id, created_at DESC);
CREATE INDEX idx_v4_regen_status ON public.pqif_v4_regeneration_queue (status, created_at);
CREATE INDEX idx_v4_ranks_date ON public.pqif_v4_product_ranks (run_date, rank);
