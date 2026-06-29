
CREATE TABLE IF NOT EXISTS public.cie_metric_mismatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  window_hours integer NOT NULL DEFAULT 24,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cie_metric_mismatches_metric_scope_uk UNIQUE (metric, scope)
);

GRANT SELECT ON public.cie_metric_mismatches TO authenticated;
GRANT ALL ON public.cie_metric_mismatches TO service_role;

ALTER TABLE public.cie_metric_mismatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cie_metric_mismatches admin read"
ON public.cie_metric_mismatches
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cie_metric_mismatches service write"
ON public.cie_metric_mismatches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS cie_metric_mismatches_metric_idx
  ON public.cie_metric_mismatches (metric, evaluated_at DESC);
