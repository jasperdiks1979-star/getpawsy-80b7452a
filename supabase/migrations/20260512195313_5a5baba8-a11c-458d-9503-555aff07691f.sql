
CREATE TABLE IF NOT EXISTS public.mi_tuning_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  key text NOT NULL,
  value numeric NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, key)
);
ALTER TABLE public.mi_tuning_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_mi_tuning_state" ON public.mi_tuning_state
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mi_tuning_state_updated BEFORE UPDATE ON public.mi_tuning_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mi_tuning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  window_days integer NOT NULL DEFAULT 7,
  recipes_evaluated integer NOT NULL DEFAULT 0,
  recipes_boosted integer NOT NULL DEFAULT 0,
  recipes_decayed integer NOT NULL DEFAULT 0,
  recipes_deactivated integer NOT NULL DEFAULT 0,
  threshold_before numeric,
  threshold_after numeric,
  hook_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);
ALTER TABLE public.mi_tuning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_mi_tuning_runs" ON public.mi_tuning_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_mi_tuning_runs_ran_at ON public.mi_tuning_runs (ran_at DESC);
