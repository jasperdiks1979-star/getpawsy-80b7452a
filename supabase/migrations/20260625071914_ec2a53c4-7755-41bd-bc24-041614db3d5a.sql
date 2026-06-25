
-- Autonomous Growth Platform — Wave 1 foundations
CREATE TABLE IF NOT EXISTS public.agp_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  trigger text,
  status text NOT NULL DEFAULT 'running',
  dry_run boolean NOT NULL DEFAULT true,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_cost_usd numeric NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agp_runs TO authenticated;
GRANT ALL ON public.agp_runs TO service_role;
ALTER TABLE public.agp_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_runs admin read" ON public.agp_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.agp_runs(id) ON DELETE CASCADE,
  engine text NOT NULL,
  step_key text NOT NULL,
  product_id uuid,
  status text NOT NULL DEFAULT 'ok',
  severity text NOT NULL DEFAULT 'info',
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agp_run_steps_run_idx ON public.agp_run_steps(run_id);
CREATE INDEX IF NOT EXISTS agp_run_steps_engine_created_idx ON public.agp_run_steps(engine, created_at DESC);
CREATE INDEX IF NOT EXISTS agp_run_steps_severity_idx ON public.agp_run_steps(severity, created_at DESC);
GRANT SELECT ON public.agp_run_steps TO authenticated;
GRANT ALL ON public.agp_run_steps TO service_role;
ALTER TABLE public.agp_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_run_steps admin read" ON public.agp_run_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agp_settings (
  id integer PRIMARY KEY DEFAULT 1,
  kill_switch boolean NOT NULL DEFAULT false,
  auto_enhance boolean NOT NULL DEFAULT false,
  auto_lifestyle boolean NOT NULL DEFAULT false,
  auto_video boolean NOT NULL DEFAULT false,
  auto_publish boolean NOT NULL DEFAULT false,
  auto_repair boolean NOT NULL DEFAULT false,
  daily_budget_usd numeric NOT NULL DEFAULT 10,
  engine_budgets jsonb NOT NULL DEFAULT '{"enhance":5,"lifestyle":3,"video":5,"copy":1}'::jsonb,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agp_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.agp_settings TO authenticated;
GRANT ALL ON public.agp_settings TO service_role;
ALTER TABLE public.agp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_settings admin read" ON public.agp_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agp_settings admin write" ON public.agp_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.agp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
