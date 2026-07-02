
-- Genesis Ω∞ — Production Safety Constitution: Golden Customer + Deployment Gate audit trail

CREATE TABLE IF NOT EXISTS public.genesis_golden_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  git_commit TEXT,
  deployment_id TEXT,
  migration_id TEXT,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  phase TEXT,
  passed_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  duration_ms INT,
  products_visible INT,
  dog_visible INT,
  cat_visible INT,
  collections_visible INT,
  search_visible INT,
  checkout_ok BOOLEAN,
  stripe_session_ok BOOLEAN,
  journey_ok BOOLEAN,
  rls_ok BOOLEAN,
  view_checksum TEXT,
  policy_checksum TEXT,
  sha256 TEXT,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_golden_runs TO authenticated;
GRANT ALL ON public.genesis_golden_runs TO service_role;
ALTER TABLE public.genesis_golden_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read golden runs"
  ON public.genesis_golden_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_golden_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.genesis_golden_runs(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  duration_ms INT,
  threshold INT,
  observed INT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_golden_checks_run ON public.genesis_golden_checks(run_id);
GRANT SELECT ON public.genesis_golden_checks TO authenticated;
GRANT ALL ON public.genesis_golden_checks TO service_role;
ALTER TABLE public.genesis_golden_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read golden checks"
  ON public.genesis_golden_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.genesis_rls_migration_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_id TEXT NOT NULL,
  affects_anonymous BOOLEAN NOT NULL DEFAULT true,
  changed_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  golden_run_id UUID REFERENCES public.genesis_golden_runs(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_rls_migration_audit TO authenticated;
GRANT ALL ON public.genesis_rls_migration_audit TO service_role;
ALTER TABLE public.genesis_rls_migration_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read rls audit"
  ON public.genesis_rls_migration_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
