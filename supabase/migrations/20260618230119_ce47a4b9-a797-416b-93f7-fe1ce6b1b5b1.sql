
CREATE TABLE IF NOT EXISTS public.pinterest_repair_snapshots (
  id uuid primary key default gen_random_uuid(),
  repair_run_id uuid not null,
  phase text not null,
  pin_id text,
  table_name text not null,
  row_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.pinterest_repair_snapshots TO authenticated;
GRANT ALL ON public.pinterest_repair_snapshots TO service_role;
ALTER TABLE public.pinterest_repair_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read snapshots" ON public.pinterest_repair_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pinterest_repair_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by uuid,
  phase1_deleted int default 0,
  phase2_recreated int default 0,
  phase3_renamed int default 0,
  phase4_retried int default 0,
  phase5_final_mismatches int,
  phase5_final_errors int,
  phase6_engines_enabled jsonb,
  report jsonb,
  status text not null default 'running',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
GRANT SELECT ON public.pinterest_repair_runs TO authenticated;
GRANT ALL ON public.pinterest_repair_runs TO service_role;
ALTER TABLE public.pinterest_repair_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read repair runs" ON public.pinterest_repair_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
