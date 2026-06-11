
-- 1. pinterest_pin_predictions
CREATE TABLE IF NOT EXISTS public.pinterest_pin_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  product_id uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  winner_p numeric NOT NULL DEFAULT 0,
  revenue_p numeric NOT NULL DEFAULT 0,
  viral_p numeric NOT NULL DEFAULT 0,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL DEFAULT 'v1'
);
CREATE INDEX IF NOT EXISTS idx_pin_predictions_pin ON public.pinterest_pin_predictions(pin_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pin_predictions_product ON public.pinterest_pin_predictions(product_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pin_predictions_winner ON public.pinterest_pin_predictions(winner_p DESC);

GRANT SELECT ON public.pinterest_pin_predictions TO authenticated;
GRANT ALL ON public.pinterest_pin_predictions TO service_role;
ALTER TABLE public.pinterest_pin_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pin predictions" ON public.pinterest_pin_predictions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. pinterest_brain_runs
CREATE TABLE IF NOT EXISTS public.pinterest_brain_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  predictions_computed int NOT NULL DEFAULT 0,
  winners_amplified int NOT NULL DEFAULT 0,
  drafts_enqueued int NOT NULL DEFAULT 0,
  products_discovered int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  dry_run boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_brain_runs_started ON public.pinterest_brain_runs(started_at DESC);

GRANT SELECT ON public.pinterest_brain_runs TO authenticated;
GRANT ALL ON public.pinterest_brain_runs TO service_role;
ALTER TABLE public.pinterest_brain_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read brain runs" ON public.pinterest_brain_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. pinterest_brain_actions
CREATE TABLE IF NOT EXISTS public.pinterest_brain_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pinterest_brain_runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  action_type text NOT NULL,
  product_id uuid,
  pin_id text,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_brain_actions_run ON public.pinterest_brain_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_brain_actions_type ON public.pinterest_brain_actions(action_type, created_at DESC);

GRANT SELECT ON public.pinterest_brain_actions TO authenticated;
GRANT ALL ON public.pinterest_brain_actions TO service_role;
ALTER TABLE public.pinterest_brain_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read brain actions" ON public.pinterest_brain_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. Extend pinterest_product_tiers
ALTER TABLE public.pinterest_product_tiers
  ADD COLUMN IF NOT EXISTS discovery_source text,
  ADD COLUMN IF NOT EXISTS pdp_strength_score numeric,
  ADD COLUMN IF NOT EXISTS revenue_bucket text;

CREATE INDEX IF NOT EXISTS idx_product_tiers_bucket ON public.pinterest_product_tiers(revenue_bucket);
