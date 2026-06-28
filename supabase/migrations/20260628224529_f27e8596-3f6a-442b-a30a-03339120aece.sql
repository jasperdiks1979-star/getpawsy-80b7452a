
CREATE OR REPLACE FUNCTION public.ede_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- EXECUTIVES
CREATE TABLE public.ede_executives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE, -- ceo|cro|cmo|cfo|cpo|cco|coo|cro_risk|cio
  title text NOT NULL,
  perspective text NOT NULL,
  mandate text NOT NULL,
  prediction_accuracy numeric NOT NULL DEFAULT 0.5,
  financial_accuracy numeric NOT NULL DEFAULT 0.5,
  business_accuracy numeric NOT NULL DEFAULT 0.5,
  trust_score numeric NOT NULL DEFAULT 0.5,
  learning_score numeric NOT NULL DEFAULT 0.5,
  confidence_calibration numeric NOT NULL DEFAULT 0.5,
  weight numeric NOT NULL DEFAULT 1.0,
  vote_count int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_executives TO authenticated;
GRANT ALL ON public.ede_executives TO service_role;
ALTER TABLE public.ede_executives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_exec admin read" ON public.ede_executives FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_exec service write" ON public.ede_executives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_ede_exec_touch BEFORE UPDATE ON public.ede_executives FOR EACH ROW EXECUTE FUNCTION public.ede_touch_updated_at();

-- PROPOSALS
CREATE TABLE public.ede_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_type text NOT NULL, -- pinterest|tiktok|creative|budget|pricing|bundle|discount|supplier|inventory|seo|publish_freq|experiment|expansion|retire|launch|feature|infrastructure
  title text NOT NULL,
  summary text NOT NULL,
  submitted_by text NOT NULL, -- engine or human id
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  intervention jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  consulted_dna text[] NOT NULL DEFAULT '{}',
  risk_level text NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  estimated_impact_usd numeric,
  status text NOT NULL DEFAULT 'draft', -- draft|voting|approved|conditional|rejected|executed|reviewed|withdrawn
  requires_human boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  voting_opened_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz
);
GRANT SELECT ON public.ede_proposals TO authenticated;
GRANT ALL ON public.ede_proposals TO service_role;
ALTER TABLE public.ede_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_prop admin read" ON public.ede_proposals FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_prop service write" ON public.ede_proposals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_ede_prop_status ON public.ede_proposals(status, created_at DESC);

-- ALTERNATIVES
CREATE TABLE public.ede_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.ede_proposals(id) ON DELETE CASCADE,
  rank int NOT NULL,
  option_label text NOT NULL,
  description text,
  expected_impact_usd numeric,
  risk numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_alternatives TO authenticated;
GRANT ALL ON public.ede_alternatives TO service_role;
ALTER TABLE public.ede_alternatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_alt admin read" ON public.ede_alternatives FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_alt service write" ON public.ede_alternatives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_ede_alt_prop ON public.ede_alternatives(proposal_id, rank);

-- VOTES
CREATE TABLE public.ede_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.ede_proposals(id) ON DELETE CASCADE,
  executive_id uuid NOT NULL REFERENCES public.ede_executives(id) ON DELETE CASCADE,
  vote text NOT NULL, -- approve|reject|conditional|abstain
  conditions text,
  reasoning text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  perspective_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  weight_at_vote numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, executive_id)
);
GRANT SELECT ON public.ede_votes TO authenticated;
GRANT ALL ON public.ede_votes TO service_role;
ALTER TABLE public.ede_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_vote admin read" ON public.ede_votes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_vote service write" ON public.ede_votes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- DECISIONS
CREATE TABLE public.ede_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.ede_proposals(id) ON DELETE CASCADE,
  outcome text NOT NULL, -- approved|conditional|rejected
  weighted_score numeric NOT NULL,
  approval_pct numeric NOT NULL,
  participating_weight numeric NOT NULL,
  conditions text,
  rollback_plan text,
  governance_required boolean NOT NULL DEFAULT false,
  human_required boolean NOT NULL DEFAULT false,
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_decisions TO authenticated;
GRANT ALL ON public.ede_decisions TO service_role;
ALTER TABLE public.ede_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_dec admin read" ON public.ede_decisions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_dec service write" ON public.ede_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SCENARIOS
CREATE TABLE public.ede_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.ede_proposals(id) ON DELETE CASCADE,
  scenario_type text NOT NULL, -- best|expected|worst|black_swan
  description text NOT NULL,
  predicted_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  probability numeric NOT NULL DEFAULT 0.25,
  expected_impact_usd numeric,
  recovery_plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_scenarios TO authenticated;
GRANT ALL ON public.ede_scenarios TO service_role;
ALTER TABLE public.ede_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_scn admin read" ON public.ede_scenarios FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_scn service write" ON public.ede_scenarios FOR ALL TO service_role USING (true) WITH CHECK (true);

-- BUSINESS VALUE
CREATE TABLE public.ede_business_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.ede_proposals(id) ON DELETE CASCADE,
  revenue_impact_usd numeric,
  profit_impact_usd numeric,
  customer_impact_score numeric,
  operational_impact_score numeric,
  brand_impact_score numeric,
  strategic_impact_score numeric,
  risk_score numeric,
  cost_usd numeric,
  expected_roi numeric,
  time_horizon_days int,
  learning_value_score numeric,
  data_completeness numeric,
  historical_similarity numeric,
  forecast_accuracy numeric,
  business_confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_business_value TO authenticated;
GRANT ALL ON public.ede_business_value TO service_role;
ALTER TABLE public.ede_business_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_bv admin read" ON public.ede_business_value FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_bv service write" ON public.ede_business_value FOR ALL TO service_role USING (true) WITH CHECK (true);

-- POST-DECISION REVIEW
CREATE TABLE public.ede_post_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.ede_proposals(id) ON DELETE CASCADE,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_quality_score numeric,
  lessons text,
  reviewer text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_post_reviews TO authenticated;
GRANT ALL ON public.ede_post_reviews TO service_role;
ALTER TABLE public.ede_post_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_pr admin read" ON public.ede_post_reviews FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_pr service write" ON public.ede_post_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SCORECARDS (rolling snapshots)
CREATE TABLE public.ede_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_id uuid NOT NULL REFERENCES public.ede_executives(id) ON DELETE CASCADE,
  window_days int NOT NULL DEFAULT 30,
  prediction_accuracy numeric,
  financial_accuracy numeric,
  business_accuracy numeric,
  trust_score numeric,
  decision_value numeric,
  long_term_performance numeric,
  vote_count int,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_scorecards TO authenticated;
GRANT ALL ON public.ede_scorecards TO service_role;
ALTER TABLE public.ede_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_sc admin read" ON public.ede_scorecards FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_sc service write" ON public.ede_scorecards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RESOURCE ALLOCATIONS
CREATE TABLE public.ede_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL, -- engineering_time|ai_credits|pinterest_publish|creative_gen|video_render|budget|infra|experiments
  allocated_to text NOT NULL,
  amount numeric NOT NULL,
  unit text NOT NULL,
  priority numeric NOT NULL DEFAULT 0.5,
  expected_value_usd numeric,
  proposal_id uuid REFERENCES public.ede_proposals(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_allocations TO authenticated;
GRANT ALL ON public.ede_allocations TO service_role;
ALTER TABLE public.ede_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_al admin read" ON public.ede_allocations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_al service write" ON public.ede_allocations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.ede_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ede_settings TO authenticated;
GRANT ALL ON public.ede_settings TO service_role;
ALTER TABLE public.ede_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ede_s admin read" ON public.ede_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "ede_s service write" ON public.ede_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- WEIGHT RECALC
CREATE OR REPLACE FUNCTION public.ede_recalc_weights()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated int := 0;
BEGIN
  UPDATE public.ede_executives SET weight = GREATEST(0.1,
    (0.30 * prediction_accuracy
   + 0.25 * financial_accuracy
   + 0.15 * business_accuracy
   + 0.15 * trust_score
   + 0.10 * confidence_calibration
   + 0.05 * learning_score) * 2.0);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.ede_recalc_weights() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ede_recalc_weights() TO service_role;

-- SEED EXECUTIVE BOARD
INSERT INTO public.ede_executives(role_key, title, perspective, mandate) VALUES
 ('ceo','Chief Executive Officer','long-term enterprise value','Maximize sustainable enterprise value and strategic coherence.'),
 ('cro','Chief Revenue Officer','top-line growth','Grow net revenue with sustainable unit economics.'),
 ('cmo','Chief Marketing Officer','demand & brand','Acquire and retain customers efficiently while protecting brand.'),
 ('cfo','Chief Financial Officer','profit & capital','Protect margin, cash, and ROI. Veto unprofitable bets.'),
 ('cpo','Chief Product Officer','product & assortment','Optimize portfolio mix, lifecycle, and customer fit.'),
 ('cco','Chief Customer Officer','customer outcome & LTV','Maximize customer experience, satisfaction, and lifetime value.'),
 ('coo','Chief Operations Officer','reliability & execution','Ensure supply, fulfillment, and operational stability.'),
 ('cro_risk','Chief Risk Officer','risk, compliance, brand safety','Block decisions that violate policy, compliance, or brand safety.'),
 ('cio','Chief Intelligence Officer','data quality & reasoning','Guarantee evidence quality, explainability, and learning from outcomes.')
ON CONFLICT (role_key) DO NOTHING;
