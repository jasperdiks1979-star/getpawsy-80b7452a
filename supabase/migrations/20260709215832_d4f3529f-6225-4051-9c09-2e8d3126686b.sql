
CREATE TABLE IF NOT EXISTS public.pinterest_native_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  pin_queue_id uuid,
  product_slug text,
  attempt integer NOT NULL DEFAULT 1,
  attempt_strategy text,
  winner_concept text,
  prediction jsonb NOT NULL DEFAULT '{}'::jsonb,
  runners_up jsonb NOT NULL DEFAULT '[]'::jsonb,
  prior_failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_native_predictions TO authenticated;
GRANT ALL ON public.pinterest_native_predictions TO service_role;
ALTER TABLE public.pinterest_native_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read pinterest_native_predictions"
  ON public.pinterest_native_predictions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pinterest_native_predictions_job_idx
  ON public.pinterest_native_predictions (job_id);
CREATE INDEX IF NOT EXISTS pinterest_native_predictions_slug_idx
  ON public.pinterest_native_predictions (product_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pinterest_native_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid REFERENCES public.pinterest_native_predictions(id) ON DELETE SET NULL,
  job_id uuid,
  pin_queue_id uuid,
  product_slug text,
  attempt integer,
  guards_passed boolean,
  guard_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_pre integer,
  actual_ci integer,
  pinterest_impressions integer,
  pinterest_saves integer,
  pinterest_outbound_clicks integer,
  organic_sessions integer,
  organic_revenue_cents integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_native_learnings TO authenticated;
GRANT ALL ON public.pinterest_native_learnings TO service_role;
ALTER TABLE public.pinterest_native_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read pinterest_native_learnings"
  ON public.pinterest_native_learnings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pinterest_native_learnings_slug_idx
  ON public.pinterest_native_learnings (product_slug, created_at DESC);
