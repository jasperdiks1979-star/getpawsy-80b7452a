
CREATE TABLE public.genesis_omega_architecture_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL DEFAULT 'full',
  edge_functions_count integer NOT NULL DEFAULT 0,
  admin_pages_count integer NOT NULL DEFAULT 0,
  tables_count integer NOT NULL DEFAULT 0,
  policies_count integer NOT NULL DEFAULT 0,
  cron_jobs_count integer NOT NULL DEFAULT 0,
  duplicates jsonb NOT NULL DEFAULT '[]'::jsonb,
  dead_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  hotspots jsonb NOT NULL DEFAULT '[]'::jsonb,
  module_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposals jsonb NOT NULL DEFAULT '[]'::jsonb,
  architecture_score numeric NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.genesis_omega_architecture_scans TO authenticated;
GRANT ALL ON public.genesis_omega_architecture_scans TO service_role;
ALTER TABLE public.genesis_omega_architecture_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read architect scans" ON public.genesis_omega_architecture_scans
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes architect scans" ON public.genesis_omega_architecture_scans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_architect_scans_created ON public.genesis_omega_architecture_scans (created_at DESC);
