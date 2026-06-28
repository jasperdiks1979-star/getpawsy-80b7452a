
CREATE TABLE IF NOT EXISTS public.revenue_pipeline_smoke_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  passed boolean NOT NULL,
  stages jsonb NOT NULL,
  failed_stages text[] NOT NULL DEFAULT '{}'
);
GRANT SELECT ON public.revenue_pipeline_smoke_runs TO authenticated;
GRANT ALL    ON public.revenue_pipeline_smoke_runs TO service_role;
ALTER TABLE public.revenue_pipeline_smoke_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admins read smoke runs" ON public.revenue_pipeline_smoke_runs
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_smoke_runs_ran_at ON public.revenue_pipeline_smoke_runs (ran_at DESC);
