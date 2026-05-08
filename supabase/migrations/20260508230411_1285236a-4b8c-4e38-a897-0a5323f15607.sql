CREATE TABLE IF NOT EXISTS public.pinterest_niche_coverage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  niche text NOT NULL,
  product_count integer NOT NULL DEFAULT 0,
  total_products integer NOT NULL DEFAULT 0,
  pct numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, niche)
);

CREATE INDEX IF NOT EXISTS idx_pncs_date ON public.pinterest_niche_coverage_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pncs_niche ON public.pinterest_niche_coverage_snapshots (niche, snapshot_date DESC);

ALTER TABLE public.pinterest_niche_coverage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read niche coverage snapshots"
  ON public.pinterest_niche_coverage_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert niche coverage snapshots"
  ON public.pinterest_niche_coverage_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));