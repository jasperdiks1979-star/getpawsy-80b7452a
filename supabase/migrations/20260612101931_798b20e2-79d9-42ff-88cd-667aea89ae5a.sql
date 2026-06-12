
-- Pinterest Ops Dashboard snapshots
CREATE TABLE IF NOT EXISTS public.pinterest_ops_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  taken_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date)
);

GRANT SELECT ON public.pinterest_ops_snapshots TO authenticated;
GRANT ALL ON public.pinterest_ops_snapshots TO service_role;
ALTER TABLE public.pinterest_ops_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read ops snapshots"
ON public.pinterest_ops_snapshots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pinterest_ops_snapshots_date
  ON public.pinterest_ops_snapshots (snapshot_date DESC);
