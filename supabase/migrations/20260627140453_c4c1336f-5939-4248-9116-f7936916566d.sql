
CREATE TABLE IF NOT EXISTS public.production_validation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  target_url TEXT NOT NULL DEFAULT 'https://getpawsy.pet',
  git_commit TEXT,
  analytics_version TEXT,
  deployment_id TEXT,
  duration_ms INTEGER,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  verified_events INTEGER NOT NULL DEFAULT 0,
  failed_events INTEGER NOT NULL DEFAULT 0,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.production_validation_runs TO authenticated;
GRANT ALL ON public.production_validation_runs TO service_role;
ALTER TABLE public.production_validation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read validation runs" ON public.production_validation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manage validation runs" ON public.production_validation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.production_validation_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.production_validation_runs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pvc_run ON public.production_validation_checks(run_id);
CREATE INDEX IF NOT EXISTS idx_pvc_status ON public.production_validation_checks(status);
GRANT SELECT ON public.production_validation_checks TO authenticated;
GRANT ALL ON public.production_validation_checks TO service_role;
ALTER TABLE public.production_validation_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read validation checks" ON public.production_validation_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manage validation checks" ON public.production_validation_checks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
