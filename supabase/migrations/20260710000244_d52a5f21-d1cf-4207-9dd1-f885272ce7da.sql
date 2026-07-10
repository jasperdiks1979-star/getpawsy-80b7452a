
CREATE TABLE IF NOT EXISTS public.pinterest_wow_recovery_batch_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wow_batch_id text NOT NULL UNIQUE,
  automation_enabled boolean NOT NULL DEFAULT true,
  batch_status text NOT NULL DEFAULT 'active',
  recovery_started_at timestamptz NOT NULL DEFAULT now(),
  recovery_expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  maximum_batch_age_hours integer NOT NULL DEFAULT 48,
  maximum_recovery_generations integer NOT NULL DEFAULT 2,
  last_dispatched_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  consecutive_failures integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wow_batch_status_chk CHECK (batch_status IN ('active','completed','expired','paused','failed'))
);

GRANT SELECT ON public.pinterest_wow_recovery_batch_registry TO authenticated;
GRANT ALL ON public.pinterest_wow_recovery_batch_registry TO service_role;
ALTER TABLE public.pinterest_wow_recovery_batch_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wow batch registry"
  ON public.pinterest_wow_recovery_batch_registry
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_wow_recovery_batch_registry_active
  ON public.pinterest_wow_recovery_batch_registry (batch_status, automation_enabled, recovery_expires_at);

CREATE TRIGGER trg_wow_batch_registry_updated_at
  BEFORE UPDATE ON public.pinterest_wow_recovery_batch_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.pinterest_wow_recovery_dispatcher_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  cron_job_id integer,
  active_batches_found integer NOT NULL DEFAULT 0,
  batches_invoked integer NOT NULL DEFAULT 0,
  batches_skipped integer NOT NULL DEFAULT 0,
  overlap_locks integer NOT NULL DEFAULT 0,
  total_candidates integer NOT NULL DEFAULT 0,
  total_selected integer NOT NULL DEFAULT 0,
  total_mutations integer NOT NULL DEFAULT 0,
  terminalized_entities integer NOT NULL DEFAULT 0,
  zero_work_batches integer NOT NULL DEFAULT 0,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_wow_recovery_dispatcher_runs TO authenticated;
GRANT ALL ON public.pinterest_wow_recovery_dispatcher_runs TO service_role;
ALTER TABLE public.pinterest_wow_recovery_dispatcher_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read dispatcher runs"
  ON public.pinterest_wow_recovery_dispatcher_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_wow_dispatcher_runs_started
  ON public.pinterest_wow_recovery_dispatcher_runs (started_at DESC);
