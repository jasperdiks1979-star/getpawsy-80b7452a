CREATE TABLE IF NOT EXISTS public.mi_arm_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  hook_family text NOT NULL,
  window_days integer NOT NULL DEFAULT 14,
  conversions integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  est_spend numeric NOT NULL DEFAULT 0,
  roas numeric NOT NULL DEFAULT 0,
  rev_per_click numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, hook_family, window_days)
);

ALTER TABLE public.mi_arm_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mi_arm_revenue read all"
  ON public.mi_arm_revenue FOR SELECT
  USING (true);

CREATE POLICY "mi_arm_revenue service write"
  ON public.mi_arm_revenue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_mi_arm_revenue_channel_hook ON public.mi_arm_revenue (channel, hook_family);
CREATE INDEX IF NOT EXISTS idx_mi_arm_revenue_computed_at ON public.mi_arm_revenue (computed_at DESC);