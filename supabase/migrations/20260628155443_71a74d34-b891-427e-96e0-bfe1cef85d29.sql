-- Adaptive Learning Governor schema
CREATE TABLE IF NOT EXISTS public.pcie2_alg_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  state text NOT NULL DEFAULT 'LEARNING' CHECK (state IN ('LEARNING','CAUTIOUS','PAUSED','RECOVERY')),
  learning_speed numeric NOT NULL DEFAULT 1.0,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence_drift numeric NOT NULL DEFAULT 0,
  ctr_volatility numeric DEFAULT 0,
  save_volatility numeric DEFAULT 0,
  purchase_volatility numeric DEFAULT 0,
  revenue_volatility numeric DEFAULT 0,
  season_tag text,
  outlier_count int NOT NULL DEFAULT 0,
  decay_half_life_days int NOT NULL DEFAULT 60,
  stability_score numeric DEFAULT 0,
  reliability_score numeric DEFAULT 0,
  drift_score numeric DEFAULT 0,
  prediction_accuracy numeric DEFAULT 0,
  decision_accuracy numeric DEFAULT 0,
  model_confidence numeric DEFAULT 0,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope)
);
GRANT SELECT ON public.pcie2_alg_state TO authenticated;
GRANT ALL ON public.pcie2_alg_state TO service_role;
ALTER TABLE public.pcie2_alg_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read alg state" ON public.pcie2_alg_state FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_alg_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  prev_state text,
  new_state text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);
GRANT SELECT ON public.pcie2_alg_runs TO authenticated;
GRANT ALL ON public.pcie2_alg_runs TO service_role;
ALTER TABLE public.pcie2_alg_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read alg runs" ON public.pcie2_alg_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_protected_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid,
  trait_key text,
  reason text,
  lifetime_revenue numeric DEFAULT 0,
  protected_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_protected_winners TO authenticated;
GRANT ALL ON public.pcie2_protected_winners TO service_role;
ALTER TABLE public.pcie2_protected_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read protected" ON public.pcie2_protected_winners FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pcie2_frozen_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  reason text,
  frozen_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_frozen_rules TO authenticated;
GRANT ALL ON public.pcie2_frozen_rules TO service_role;
ALTER TABLE public.pcie2_frozen_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read frozen" ON public.pcie2_frozen_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

-- Seed default state
INSERT INTO public.pcie2_alg_state (scope) VALUES ('global')
ON CONFLICT (scope) DO NOTHING;