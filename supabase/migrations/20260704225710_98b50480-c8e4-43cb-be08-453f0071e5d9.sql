
CREATE TABLE IF NOT EXISTS public.stabilization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  monitor text NOT NULL DEFAULT 'visitor-world-map-pro',
  status text NOT NULL CHECK (status IN ('pass','warn','fail','error')),
  duration_ms integer,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  incidents jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stabilization_runs TO authenticated;
GRANT ALL ON public.stabilization_runs TO service_role;

ALTER TABLE public.stabilization_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read stabilization runs"
ON public.stabilization_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_stabilization_runs_ran_at ON public.stabilization_runs (ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_stabilization_runs_monitor_ran_at ON public.stabilization_runs (monitor, ran_at DESC);
