
CREATE OR REPLACE FUNCTION public.aee_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- HYPOTHESES
CREATE TABLE public.aee_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL, -- pinterest|creative|headline|cta|image|video|typography|badge|hook|board|publish_time|publish_freq|seasonality|keyword|seo|landing|pdp|product_order|bundle|pricing|discount|shipping|trust|review|email|push
  statement text NOT NULL,
  business_rationale text,
  supporting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternative_explanations jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_revenue_usd numeric,
  expected_profit_usd numeric,
  expected_customer_impact numeric,
  expected_learning_value numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  risk numeric NOT NULL DEFAULT 0.5,
  implementation_cost numeric NOT NULL DEFAULT 0.3,
  opportunity_size numeric NOT NULL DEFAULT 0.5,
  business_alignment numeric NOT NULL DEFAULT 0.5,
  priority_score numeric NOT NULL DEFAULT 0,
  source_engine text,
  status text NOT NULL DEFAULT 'open', -- open|promoted|rejected|stale
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_hypotheses TO authenticated;
GRANT ALL ON public.aee_hypotheses TO service_role;
ALTER TABLE public.aee_hypotheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_hyp admin read" ON public.aee_hypotheses FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_hyp service write" ON public.aee_hypotheses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_aee_hyp_touch BEFORE UPDATE ON public.aee_hypotheses FOR EACH ROW EXECUTE FUNCTION public.aee_touch_updated_at();
CREATE INDEX idx_aee_hyp_status_prio ON public.aee_hypotheses(status, priority_score DESC);

-- EXPERIMENTS
CREATE TABLE public.aee_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id uuid REFERENCES public.aee_hypotheses(id) ON DELETE SET NULL,
  area text NOT NULL,
  name text NOT NULL,
  objective text NOT NULL,
  design text NOT NULL DEFAULT 'ab', -- ab|abc|multivariate|sequential|bayesian|bandit
  primary_metric text NOT NULL,
  guardrail_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_metric text, -- revenue|profit|cvr|ltv
  rollout_pct numeric NOT NULL DEFAULT 1, -- 1|5|10|25|50|100
  target_audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  traffic_allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  minimum_sample_size int,
  minimum_detectable_effect numeric,
  expected_duration_days int,
  risk_level text NOT NULL DEFAULT 'medium',
  governance_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  -- draft|approved|running|paused|stopped|evaluated|winner_declared|no_difference|failed|archived
  submitted_by text,
  approved_by text,
  approved_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_experiments TO authenticated;
GRANT ALL ON public.aee_experiments TO service_role;
ALTER TABLE public.aee_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_exp admin read" ON public.aee_experiments FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_exp service write" ON public.aee_experiments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_aee_exp_touch BEFORE UPDATE ON public.aee_experiments FOR EACH ROW EXECUTE FUNCTION public.aee_touch_updated_at();
CREATE INDEX idx_aee_exp_status ON public.aee_experiments(status, created_at DESC);

-- VARIANTS
CREATE TABLE public.aee_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  label text NOT NULL,
  is_control boolean NOT NULL DEFAULT false,
  weight numeric NOT NULL DEFAULT 0.5,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  exposure int NOT NULL DEFAULT 0,
  successes int NOT NULL DEFAULT 0,
  value_sum numeric NOT NULL DEFAULT 0,
  profit_sum numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, variant_key)
);
GRANT SELECT ON public.aee_variants TO authenticated;
GRANT ALL ON public.aee_variants TO service_role;
ALTER TABLE public.aee_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_var admin read" ON public.aee_variants FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_var service write" ON public.aee_variants FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ASSIGNMENTS (audit)
CREATE TABLE public.aee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.aee_variants(id) ON DELETE CASCADE,
  subject_type text NOT NULL, -- visitor|session|user|pin|product|order|campaign
  subject_id text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, subject_type, subject_id)
);
GRANT SELECT ON public.aee_assignments TO authenticated;
GRANT ALL ON public.aee_assignments TO service_role;
ALTER TABLE public.aee_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_asg admin read" ON public.aee_assignments FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_asg service write" ON public.aee_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_aee_asg_exp ON public.aee_assignments(experiment_id, variant_id);

-- OBSERVATIONS (raw metric stream)
CREATE TABLE public.aee_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.aee_variants(id) ON DELETE CASCADE,
  metric text NOT NULL,
  exposure_delta int NOT NULL DEFAULT 0,
  success_delta int NOT NULL DEFAULT 0,
  value_delta numeric NOT NULL DEFAULT 0,
  profit_delta numeric NOT NULL DEFAULT 0,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_observations TO authenticated;
GRANT ALL ON public.aee_observations TO service_role;
ALTER TABLE public.aee_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_obs admin read" ON public.aee_observations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_obs service write" ON public.aee_observations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_aee_obs_exp_time ON public.aee_observations(experiment_id, observed_at DESC);

-- RESULTS
CREATE TABLE public.aee_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.aee_variants(id) ON DELETE CASCADE,
  n int NOT NULL,
  conv_rate numeric,
  lift numeric,
  ci_low numeric,
  ci_high numeric,
  z numeric,
  p_value numeric,
  bayesian_prob_best numeric,
  power numeric,
  mde numeric,
  business_value_usd numeric,
  profit_usd numeric,
  ltv_delta numeric,
  is_significant boolean NOT NULL DEFAULT false,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, variant_id, evaluated_at)
);
GRANT SELECT ON public.aee_results TO authenticated;
GRANT ALL ON public.aee_results TO service_role;
ALTER TABLE public.aee_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_res admin read" ON public.aee_results FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_res service write" ON public.aee_results FOR ALL TO service_role USING (true) WITH CHECK (true);

-- WINNERS
CREATE TABLE public.aee_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL UNIQUE REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  winning_variant uuid NOT NULL REFERENCES public.aee_variants(id),
  business_lift_pct numeric,
  revenue_lift_usd numeric,
  profit_lift_usd numeric,
  confidence numeric,
  bayesian_prob_best numeric,
  recommended_action text,
  declared_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_winners TO authenticated;
GRANT ALL ON public.aee_winners TO service_role;
ALTER TABLE public.aee_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_win admin read" ON public.aee_winners FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_win service write" ON public.aee_winners FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FAILURES
CREATE TABLE public.aee_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL UNIQUE REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  why_failed text NOT NULL,
  unexpected_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternative_explanations jsonb NOT NULL DEFAULT '[]'::jsonb,
  lessons text,
  business_lessons text,
  failed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_failures TO authenticated;
GRANT ALL ON public.aee_failures TO service_role;
ALTER TABLE public.aee_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_fail admin read" ON public.aee_failures FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_fail service write" ON public.aee_failures FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PLAYBOOKS (successes)
CREATE TABLE public.aee_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  name text NOT NULL,
  derived_from uuid REFERENCES public.aee_experiments(id),
  recipe jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_lift_usd numeric,
  applicability text,
  reuse_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_playbooks TO authenticated;
GRANT ALL ON public.aee_playbooks TO service_role;
ALTER TABLE public.aee_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_pb admin read" ON public.aee_playbooks FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_pb service write" ON public.aee_playbooks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RECOMMENDATIONS
CREATE TABLE public.aee_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type text NOT NULL, -- highest_value|highest_uncertainty|biggest_opportunity|weakest_assumption|most_expensive_unknown
  area text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  expected_value_usd numeric,
  confidence numeric,
  priority_score numeric,
  hypothesis_id uuid REFERENCES public.aee_hypotheses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open', -- open|promoted|rejected
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_recommendations TO authenticated;
GRANT ALL ON public.aee_recommendations TO service_role;
ALTER TABLE public.aee_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_rc admin read" ON public.aee_recommendations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_rc service write" ON public.aee_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SAFETY LOG
CREATE TABLE public.aee_safety_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.aee_experiments(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_taken text NOT NULL, -- paused|stopped|rolled_back|alerted
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_safety_log TO authenticated;
GRANT ALL ON public.aee_safety_log TO service_role;
ALTER TABLE public.aee_safety_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_sl admin read" ON public.aee_safety_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_sl service write" ON public.aee_safety_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.aee_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aee_settings TO authenticated;
GRANT ALL ON public.aee_settings TO service_role;
ALTER TABLE public.aee_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aee_set admin read" ON public.aee_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "aee_set service write" ON public.aee_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PRIORITY SCORE HELPER
CREATE OR REPLACE FUNCTION public.aee_priority_score(p uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    0.30 * COALESCE(h.expected_profit_usd, 0) / 1000.0
  + 0.20 * COALESCE(h.expected_revenue_usd, 0) / 1000.0
  + 0.20 * COALESCE(h.expected_learning_value, 0)
  + 0.10 * COALESCE(h.opportunity_size, 0)
  + 0.10 * COALESCE(h.business_alignment, 0)
  - 0.05 * COALESCE(h.implementation_cost, 0)
  - 0.05 * COALESCE(h.risk, 0)
  )
  FROM public.aee_hypotheses h WHERE h.id = p
$$;
REVOKE ALL ON FUNCTION public.aee_priority_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aee_priority_score(uuid) TO service_role, authenticated;

-- TWO-PROPORTION Z TEST + WILSON CI HELPER
CREATE OR REPLACE FUNCTION public.aee_evaluate_zscore(
  c_succ int, c_n int, t_succ int, t_n int
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  p1 numeric := CASE WHEN c_n > 0 THEN c_succ::numeric/c_n ELSE 0 END;
  p2 numeric := CASE WHEN t_n > 0 THEN t_succ::numeric/t_n ELSE 0 END;
  p_pool numeric;
  se numeric;
  z numeric := 0;
  lift numeric := 0;
BEGIN
  IF c_n = 0 OR t_n = 0 THEN
    RETURN jsonb_build_object('z', 0, 'lift', 0, 'p1', p1, 'p2', p2);
  END IF;
  p_pool := (c_succ + t_succ)::numeric / (c_n + t_n);
  se := sqrt(GREATEST(p_pool * (1 - p_pool) * (1.0/c_n + 1.0/t_n), 1e-12));
  z := (p2 - p1) / NULLIF(se, 0);
  lift := CASE WHEN p1 > 0 THEN (p2 - p1) / p1 ELSE 0 END;
  RETURN jsonb_build_object('z', z, 'lift', lift, 'p1', p1, 'p2', p2, 'se', se);
END $$;
REVOKE ALL ON FUNCTION public.aee_evaluate_zscore(int,int,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aee_evaluate_zscore(int,int,int,int) TO service_role, authenticated;
