
CREATE TABLE IF NOT EXISTS public.pinterest_taste_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  value text NOT NULL,
  lift_score numeric NOT NULL DEFAULT 0,
  velocity_7d numeric NOT NULL DEFAULT 0,
  momentum_30d numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  sample_n integer NOT NULL DEFAULT 0,
  expected_lifetime_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'active',
  computed_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid,
  UNIQUE (dimension, value)
);
CREATE INDEX IF NOT EXISTS idx_pts_dim_lift ON public.pinterest_taste_signals (dimension, lift_score DESC);
CREATE INDEX IF NOT EXISTS idx_pts_status ON public.pinterest_taste_signals (status, computed_at DESC);

GRANT SELECT ON public.pinterest_taste_signals TO authenticated;
GRANT ALL ON public.pinterest_taste_signals TO service_role;
ALTER TABLE public.pinterest_taste_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read taste signals" ON public.pinterest_taste_signals
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes taste signals" ON public.pinterest_taste_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pinterest_taste_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key text NOT NULL UNIQUE,
  label text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  momentum numeric NOT NULL DEFAULT 0,
  sample_n integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ptc_weight ON public.pinterest_taste_clusters (weight DESC);

GRANT SELECT ON public.pinterest_taste_clusters TO authenticated;
GRANT ALL ON public.pinterest_taste_clusters TO service_role;
ALTER TABLE public.pinterest_taste_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read taste clusters" ON public.pinterest_taste_clusters
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes taste clusters" ON public.pinterest_taste_clusters
  FOR ALL TO service_role USING (true) WITH CHECK (true);
