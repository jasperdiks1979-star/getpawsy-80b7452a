CREATE TABLE IF NOT EXISTS public.mi_audience_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key text NOT NULL,
  cohort_source text,
  cohort_landing text,
  channel text NOT NULL,
  hook_family text NOT NULL,
  conversions integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  share numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_key, channel, hook_family)
);

CREATE INDEX IF NOT EXISTS idx_mi_audience_clusters_cohort ON public.mi_audience_clusters (cohort_key);
CREATE INDEX IF NOT EXISTS idx_mi_audience_clusters_computed_at ON public.mi_audience_clusters (computed_at DESC);

ALTER TABLE public.mi_audience_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mi_audience_clusters read all"
  ON public.mi_audience_clusters FOR SELECT USING (true);

CREATE POLICY "mi_audience_clusters service write"
  ON public.mi_audience_clusters FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');