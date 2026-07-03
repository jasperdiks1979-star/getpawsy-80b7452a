
-- ============================================================
-- Phase 17 Wave C: Deterministic Quality Engines + Gate Registry
-- ============================================================

-- 1) LANDING QUALITY SCORES ---------------------------------
CREATE TABLE IF NOT EXISTS public.landing_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  audited_at timestamptz NOT NULL DEFAULT now(),
  trust_score numeric NOT NULL DEFAULT 0,
  clarity_score numeric NOT NULL DEFAULT 0,
  speed_score numeric NOT NULL DEFAULT 0,
  pinterest_consistency_score numeric NOT NULL DEFAULT 0,
  overall_score numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  human_sessions_24h integer NOT NULL DEFAULT 0,
  bounce_rate numeric,
  avg_scroll_depth numeric,
  lcp_ms numeric,
  cls numeric,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_quality_url_time
  ON public.landing_quality_scores (url, audited_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_quality_overall
  ON public.landing_quality_scores (overall_score);

GRANT SELECT ON public.landing_quality_scores TO authenticated;
GRANT ALL ON public.landing_quality_scores TO service_role;
ALTER TABLE public.landing_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read landing quality"
  ON public.landing_quality_scores FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service role writes landing quality"
  ON public.landing_quality_scores FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 2) PRODUCT QUALITY SCORES ---------------------------------
CREATE TABLE IF NOT EXISTS public.product_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  pdp_health_score numeric NOT NULL DEFAULT 0,
  creative_dna_score numeric NOT NULL DEFAULT 0,
  winner_score numeric NOT NULL DEFAULT 0,
  review_score numeric NOT NULL DEFAULT 0,
  overall_score numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_quality_product_time
  ON public.product_quality_scores (product_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_quality_overall
  ON public.product_quality_scores (overall_score);

GRANT SELECT ON public.product_quality_scores TO authenticated;
GRANT ALL ON public.product_quality_scores TO service_role;
ALTER TABLE public.product_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read product quality"
  ON public.product_quality_scores FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service role writes product quality"
  ON public.product_quality_scores FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3) MODULE ACTIVATION GATES --------------------------------
-- Registry that keeps every intelligence module deterministic-only
-- until evidence thresholds mandated by the Genesis Revenue Constitution
-- and Conversion Integrity Engine are reached. Only then does is_active
-- flip true and downstream code path unlocks statistical/AI behaviour.
CREATE TABLE IF NOT EXISTS public.module_activation_gates (
  module_key text PRIMARY KEY,
  category text NOT NULL,
  description text NOT NULL,
  required_samples integer NOT NULL DEFAULT 30,
  required_confidence numeric NOT NULL DEFAULT 0.90,
  current_samples integer NOT NULL DEFAULT 0,
  current_confidence numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  evaluation_query text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.module_activation_gates TO authenticated;
GRANT ALL ON public.module_activation_gates TO service_role;
ALTER TABLE public.module_activation_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read activation gates"
  ON public.module_activation_gates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service role writes activation gates"
  ON public.module_activation_gates FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_gate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_mag_updated ON public.module_activation_gates;
CREATE TRIGGER trg_mag_updated
  BEFORE UPDATE ON public.module_activation_gates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gate();

-- Seed the registry with every downstream intelligence module.
-- Every entry starts inactive; the evaluator function flips
-- is_active when the sample+confidence thresholds are cleared.
INSERT INTO public.module_activation_gates
  (module_key, category, description, required_samples, required_confidence, evaluation_query)
VALUES
  ('creative_dna_learning', 'ai_learning',
   'Creative DNA weight updates from pin performance',
   500, 0.90,
   'SELECT COUNT(*)::int, COALESCE(AVG(CASE WHEN impressions > 100 THEN 1 ELSE 0 END),0)::numeric FROM public.pei_creative_dna WHERE created_at > now() - interval ''30 days'''),
  ('revenue_prediction', 'ai_prediction',
   'Forward revenue forecasting from real human sessions',
   1000, 0.90,
   'SELECT COUNT(*)::int, LEAST(1.0, COUNT(*)::numeric / 1000)::numeric FROM public.real_human_sessions WHERE first_seen > now() - interval ''30 days'''),
  ('auto_optimisation', 'auto_fix',
   'Automatic UX/copy/creative optimisation actions',
   200, 0.90,
   'SELECT COUNT(*)::int, LEAST(1.0, COUNT(*)::numeric / 200)::numeric FROM public.real_human_sessions WHERE reached_atc = true AND first_seen > now() - interval ''30 days'''),
  ('root_cause_ranking', 'ai_analysis',
   'Ranked root-cause findings with expected revenue impact',
   100, 0.85,
   'SELECT COUNT(*)::int, LEAST(1.0, COUNT(*)::numeric / 100)::numeric FROM public.real_human_sessions WHERE first_seen > now() - interval ''7 days'''),
  ('landing_quality_ai', 'ai_scoring',
   'AI-enhanced landing page quality scoring beyond deterministic rules',
   50, 0.80,
   'SELECT COUNT(DISTINCT url)::int, LEAST(1.0, COUNT(DISTINCT url)::numeric / 50)::numeric FROM public.landing_quality_scores WHERE audited_at > now() - interval ''30 days'''),
  ('product_quality_ai', 'ai_scoring',
   'AI-enhanced product quality scoring beyond deterministic rules',
   30, 0.80,
   'SELECT COUNT(DISTINCT product_id)::int, LEAST(1.0, COUNT(DISTINCT product_id)::numeric / 30)::numeric FROM public.product_quality_scores WHERE computed_at > now() - interval ''30 days'''),
  ('confidence_recommendations', 'ai_recommendation',
   'Confidence-scored recommendations shown in Revenue Command Center',
   300, 0.90,
   'SELECT COUNT(*)::int, LEAST(1.0, COUNT(*)::numeric / 300)::numeric FROM public.real_human_sessions WHERE first_seen > now() - interval ''30 days''')
ON CONFLICT (module_key) DO NOTHING;

-- Evaluator: runs each seeded query, updates current_* + is_active.
CREATE OR REPLACE FUNCTION public.evaluate_module_gates()
RETURNS TABLE(module_key text, is_active boolean, current_samples integer, current_confidence numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_samples integer;
  v_conf numeric;
  v_active boolean;
BEGIN
  FOR r IN SELECT * FROM public.module_activation_gates LOOP
    BEGIN
      EXECUTE r.evaluation_query INTO v_samples, v_conf;
    EXCEPTION WHEN OTHERS THEN
      v_samples := 0; v_conf := 0;
    END;
    v_active := (v_samples >= r.required_samples AND v_conf >= r.required_confidence);
    UPDATE public.module_activation_gates
      SET current_samples = COALESCE(v_samples, 0),
          current_confidence = COALESCE(v_conf, 0),
          is_active = v_active,
          activated_at = CASE
            WHEN v_active AND activated_at IS NULL THEN now()
            WHEN NOT v_active THEN NULL
            ELSE activated_at END,
          last_evaluated_at = now()
      WHERE module_activation_gates.module_key = r.module_key;
    module_key := r.module_key;
    is_active := v_active;
    current_samples := COALESCE(v_samples, 0);
    current_confidence := COALESCE(v_conf, 0);
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.evaluate_module_gates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_module_gates() TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_module_gates() TO authenticated;

-- Convenience helper the app + edge fns use to check "may I learn?"
CREATE OR REPLACE FUNCTION public.module_is_active(_module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.module_activation_gates WHERE module_key = _module_key),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.module_is_active(text) TO PUBLIC;
