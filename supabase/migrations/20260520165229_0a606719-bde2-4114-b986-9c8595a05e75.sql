
CREATE TABLE IF NOT EXISTS public.growth_decision_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.growth_decisions(id) ON DELETE CASCADE,
  snapshot_day date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  ctr numeric(6,4) NOT NULL DEFAULT 0,
  reward numeric(6,3) NOT NULL DEFAULT 0,
  pin_count integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_id, snapshot_day)
);

ALTER TABLE public.growth_decision_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all" ON public.growth_decision_metrics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_gdm_decision ON public.growth_decision_metrics(decision_id);
CREATE INDEX IF NOT EXISTS idx_gdm_day ON public.growth_decision_metrics(snapshot_day DESC);
