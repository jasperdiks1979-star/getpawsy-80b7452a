
CREATE TABLE IF NOT EXISTS public.pinterest_growth_director_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  duration_ms integer,
  products_scored integer NOT NULL DEFAULT 0,
  boards_evaluated integer NOT NULL DEFAULT 0,
  opportunities_found integer NOT NULL DEFAULT 0,
  decisions_emitted integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.pinterest_growth_director_runs TO authenticated;
GRANT ALL ON public.pinterest_growth_director_runs TO service_role;
ALTER TABLE public.pinterest_growth_director_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gd runs" ON public.pinterest_growth_director_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes gd runs" ON public.pinterest_growth_director_runs
  TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pinterest_growth_director_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pinterest_growth_director_runs(id) ON DELETE SET NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  account_kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  board_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  bottlenecks jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  outlook_30d jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0
);
GRANT SELECT ON public.pinterest_growth_director_snapshots TO authenticated;
GRANT ALL ON public.pinterest_growth_director_snapshots TO service_role;
ALTER TABLE public.pinterest_growth_director_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gd snapshots" ON public.pinterest_growth_director_snapshots
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes gd snapshots" ON public.pinterest_growth_director_snapshots
  TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_gd_snapshots_computed ON public.pinterest_growth_director_snapshots(computed_at DESC);

CREATE TABLE IF NOT EXISTS public.pinterest_growth_director_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pinterest_growth_director_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  expected_impact_score numeric NOT NULL DEFAULT 0,
  expected_revenue_cents_30d integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  effort text NOT NULL DEFAULT 'low',
  dependencies text[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_kind text,
  target_ref text,
  status text NOT NULL DEFAULT 'proposed'
);
GRANT SELECT ON public.pinterest_growth_director_decisions TO authenticated;
GRANT ALL ON public.pinterest_growth_director_decisions TO service_role;
ALTER TABLE public.pinterest_growth_director_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gd decisions" ON public.pinterest_growth_director_decisions
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes gd decisions" ON public.pinterest_growth_director_decisions
  TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_gd_decisions_created ON public.pinterest_growth_director_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gd_decisions_impact ON public.pinterest_growth_director_decisions(expected_impact_score DESC);
