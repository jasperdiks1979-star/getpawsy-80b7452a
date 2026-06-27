
-- 1. MODELS
CREATE TABLE IF NOT EXISTS public.organic_confidence_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  name text NOT NULL,
  description text,
  reason text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  negative_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  market_demand_boost numeric NOT NULL DEFAULT 5,
  parent_version integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);

CREATE UNIQUE INDEX IF NOT EXISTS organic_confidence_models_one_active
  ON public.organic_confidence_models (status) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organic_confidence_models TO authenticated;
GRANT ALL ON public.organic_confidence_models TO service_role;

ALTER TABLE public.organic_confidence_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage organic confidence models"
  ON public.organic_confidence_models FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages organic confidence models"
  ON public.organic_confidence_models FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 2. PREDICTIONS
CREATE TABLE IF NOT EXISTS public.organic_confidence_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('global','product','category','pin')),
  entity_id text,
  model_version integer NOT NULL,
  predicted_score numeric NOT NULL,
  predicted_level text,
  predicted_level_index integer,
  components jsonb,
  inputs jsonb,
  predicted_at timestamptz NOT NULL DEFAULT now(),
  measured_at timestamptz,
  actual_score numeric,
  actual_purchases integer,
  actual_revenue numeric,
  error_abs numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organic_confidence_predictions_entity_idx
  ON public.organic_confidence_predictions (entity_type, entity_id, predicted_at DESC);
CREATE INDEX IF NOT EXISTS organic_confidence_predictions_model_idx
  ON public.organic_confidence_predictions (model_version, predicted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organic_confidence_predictions TO authenticated;
GRANT ALL ON public.organic_confidence_predictions TO service_role;

ALTER TABLE public.organic_confidence_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read organic confidence predictions"
  ON public.organic_confidence_predictions FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages organic confidence predictions"
  ON public.organic_confidence_predictions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 3. CHANGE LOG
CREATE TABLE IF NOT EXISTS public.organic_confidence_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES public.organic_confidence_models(id) ON DELETE CASCADE,
  model_version integer,
  action text NOT NULL,
  reason text,
  changes jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organic_confidence_change_log_model_idx
  ON public.organic_confidence_change_log (model_id, created_at DESC);

GRANT SELECT, INSERT ON public.organic_confidence_change_log TO authenticated;
GRANT ALL ON public.organic_confidence_change_log TO service_role;

ALTER TABLE public.organic_confidence_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read organic confidence change log"
  ON public.organic_confidence_change_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert organic confidence change log"
  ON public.organic_confidence_change_log FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages organic confidence change log"
  ON public.organic_confidence_change_log FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.organic_confidence_models_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS organic_confidence_models_touch_t ON public.organic_confidence_models;
CREATE TRIGGER organic_confidence_models_touch_t
  BEFORE UPDATE ON public.organic_confidence_models
  FOR EACH ROW EXECUTE FUNCTION public.organic_confidence_models_touch();

-- 5. helper: active model accessor (admin readable, service-role usable)
CREATE OR REPLACE FUNCTION public.get_active_organic_confidence_model()
RETURNS public.organic_confidence_models
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.organic_confidence_models
  WHERE status = 'active'
  ORDER BY activated_at DESC NULLS LAST, version DESC
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_active_organic_confidence_model() TO authenticated, service_role;

-- 6. SEED v1 with current hardcoded weights
INSERT INTO public.organic_confidence_models
  (version, name, description, reason, status, weights, negative_weights, thresholds, market_demand_boost, activated_at)
VALUES (
  1,
  'Baseline Organic Confidence v1',
  'Initial baseline matching the original hardcoded scoring (6 core component weights + 5pt market demand boost).',
  'Bootstrapped from src/lib/organicConfidence.ts to make the engine configurable without changing behaviour.',
  'active',
  jsonb_build_object(
    'organic_visitors',   0.15,
    'organic_engagement', 0.20,
    'organic_conversion', 0.25,
    'organic_revenue',    0.15,
    'returning_quality',  0.10,
    'paid_independence',  0.15
  ),
  jsonb_build_object(
    'bounce_rate',         0,
    'paid_dependence',     0,
    'declining_trend',     0,
    'low_scroll_depth',    0,
    'weak_conversion',     0,
    'inventory_risk',      0,
    'shipping_risk',       0,
    'refund_risk',         0,
    'low_trust',           0,
    'creative_fatigue',    0,
    'content_saturation',  0
  ),
  jsonb_build_object(
    'emerging',         jsonb_build_object('min_visitors', 10, 'min_score', 20),
    'validated',        jsonb_build_object('min_visitors', 50, 'min_score', 45, 'min_purchases', 1, 'min_atc_rate', 0.05),
    'organic_winner',   jsonb_build_object('min_purchases', 2, 'min_score', 65),
    'scale_candidate',  jsonb_build_object('min_purchases', 3, 'min_score', 80, 'min_cvr', 0.02, 'max_paid_share', 0.5)
  ),
  5,
  now()
)
ON CONFLICT (version) DO NOTHING;
