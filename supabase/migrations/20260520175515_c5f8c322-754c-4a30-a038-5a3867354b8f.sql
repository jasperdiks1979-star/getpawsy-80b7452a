CREATE TABLE IF NOT EXISTS public.growth_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('product','angle')),
  entity_key text NOT NULL,
  horizon_days integer NOT NULL CHECK (horizon_days IN (7, 30)),
  forecast_reward numeric NOT NULL DEFAULT 0,
  forecast_revenue numeric NOT NULL DEFAULT 0,
  trend_slope numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  rising boolean NOT NULL DEFAULT false,
  sample_size integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_key, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_gf_rising ON public.growth_forecasts (rising, horizon_days, forecast_reward DESC);
CREATE INDEX IF NOT EXISTS idx_gf_entity ON public.growth_forecasts (entity_type, entity_key);

ALTER TABLE public.growth_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage growth forecasts"
ON public.growth_forecasts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));