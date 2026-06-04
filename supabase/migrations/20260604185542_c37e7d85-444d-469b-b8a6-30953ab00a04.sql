CREATE TABLE IF NOT EXISTS public.cj_variant_repair_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  repaired int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  current_product_id uuid,
  current_product_name text,
  last_result jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.cj_variant_repair_runs TO authenticated;
GRANT ALL ON public.cj_variant_repair_runs TO service_role;

ALTER TABLE public.cj_variant_repair_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read cj_variant_repair_runs"
  ON public.cj_variant_repair_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service writes cj_variant_repair_runs"
  ON public.cj_variant_repair_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.cj_variant_repair_runs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cj_variant_repair_runs;

CREATE INDEX IF NOT EXISTS idx_cj_variant_repair_runs_started_at
  ON public.cj_variant_repair_runs (started_at DESC);