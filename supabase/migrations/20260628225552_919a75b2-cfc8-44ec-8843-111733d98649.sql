
CREATE OR REPLACE FUNCTION public.roe_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.roe_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  source text NOT NULL DEFAULT 'composite',
  visitors int, sessions int, qualified_visits int,
  ctr numeric, outbound_ctr numeric,
  product_views int, add_to_cart int, checkout_started int,
  orders int, repeat_orders int, refunds int, returns int,
  aov numeric, revenue numeric, gross_margin numeric, net_margin numeric,
  contribution_margin numeric,
  cac numeric, ltv numeric, payback_days numeric, cash_flow numeric, roas numeric,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, source)
);
GRANT SELECT ON public.roe_snapshots TO authenticated;
GRANT ALL ON public.roe_snapshots TO service_role;
ALTER TABLE public.roe_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_sn admin read" ON public.roe_snapshots FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_sn service write" ON public.roe_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_roe_sn_touch BEFORE UPDATE ON public.roe_snapshots FOR EACH ROW EXECUTE FUNCTION public.roe_touch_updated_at();

CREATE TABLE public.roe_revenue_tree (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL, node text NOT NULL, value numeric,
  sensitivity_revenue numeric, sensitivity_profit numeric, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, node)
);
GRANT SELECT ON public.roe_revenue_tree TO authenticated;
GRANT ALL ON public.roe_revenue_tree TO service_role;
ALTER TABLE public.roe_revenue_tree ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_tree admin read" ON public.roe_revenue_tree FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_tree service write" ON public.roe_revenue_tree FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_bottlenecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  area text NOT NULL, description text NOT NULL,
  severity numeric NOT NULL DEFAULT 0.5,
  expected_unlock_usd numeric, recommended_action text,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open'
);
GRANT SELECT ON public.roe_bottlenecks TO authenticated;
GRANT ALL ON public.roe_bottlenecks TO service_role;
ALTER TABLE public.roe_bottlenecks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_bn admin read" ON public.roe_bottlenecks FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_bn service write" ON public.roe_bottlenecks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_roe_bn_status ON public.roe_bottlenecks(status, severity DESC);

CREATE TABLE public.roe_marginal_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lever text NOT NULL, delta_pct numeric NOT NULL,
  expected_revenue_usd numeric, expected_profit_usd numeric,
  expected_payback_days numeric, risk numeric NOT NULL DEFAULT 0.5,
  roi numeric, confidence numeric NOT NULL DEFAULT 0.5, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_marginal_value TO authenticated;
GRANT ALL ON public.roe_marginal_value TO service_role;
ALTER TABLE public.roe_marginal_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_mv admin read" ON public.roe_marginal_value FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_mv service write" ON public.roe_marginal_value FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_portfolio_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL, product_id text NOT NULL, product_label text,
  revenue_30d numeric, profit_30d numeric, margin_pct numeric,
  growth_pct numeric, trend_score numeric, ltv_score numeric, refund_rate numeric,
  operational_complexity numeric, shipping_cost numeric, inventory_stability numeric,
  expected_future_value_usd numeric, composite_score numeric NOT NULL DEFAULT 0,
  rank int, recommended_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, product_id)
);
GRANT SELECT ON public.roe_portfolio_ranks TO authenticated;
GRANT ALL ON public.roe_portfolio_ranks TO service_role;
ALTER TABLE public.roe_portfolio_ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_pr admin read" ON public.roe_portfolio_ranks FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_pr service write" ON public.roe_portfolio_ranks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_roe_pr_date ON public.roe_portfolio_ranks(snapshot_date, composite_score DESC);

CREATE TABLE public.roe_capital_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL, resource text NOT NULL,
  recommended_share_pct numeric NOT NULL,
  expected_return_usd numeric, rationale text,
  confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, resource)
);
GRANT SELECT ON public.roe_capital_allocations TO authenticated;
GRANT ALL ON public.roe_capital_allocations TO service_role;
ALTER TABLE public.roe_capital_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_ca admin read" ON public.roe_capital_allocations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_ca service write" ON public.roe_capital_allocations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL, intervention jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_revenue_usd numeric, expected_profit_usd numeric, expected_cash_flow_usd numeric,
  expected_risk numeric, confidence numeric NOT NULL DEFAULT 0.5,
  rationale text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_simulations TO authenticated;
GRANT ALL ON public.roe_simulations TO service_role;
ALTER TABLE public.roe_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_si admin read" ON public.roe_simulations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_si service write" ON public.roe_simulations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon text NOT NULL, metric text NOT NULL,
  target_date date NOT NULL, forecast numeric NOT NULL,
  ci_low numeric, ci_high numeric,
  model text, model_version text NOT NULL DEFAULT 'v1',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (horizon, metric, target_date, model_version)
);
GRANT SELECT ON public.roe_forecasts TO authenticated;
GRANT ALL ON public.roe_forecasts TO service_role;
ALTER TABLE public.roe_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_fc admin read" ON public.roe_forecasts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_fc service write" ON public.roe_forecasts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_unit_economics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  contribution_margin numeric, break_even_cpa numeric, break_even_roas numeric,
  gross_margin_pct numeric, net_margin_pct numeric, operating_margin_pct numeric,
  customer_payback_days numeric, ltv_cac_ratio numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_unit_economics TO authenticated;
GRANT ALL ON public.roe_unit_economics TO service_role;
ALTER TABLE public.roe_unit_economics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_ue admin read" ON public.roe_unit_economics FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_ue service write" ON public.roe_unit_economics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_customer_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment text NOT NULL UNIQUE,
  expected_ltv numeric, expected_repeat_purchases numeric,
  expected_profit_contribution numeric, expected_referral_value numeric,
  expected_churn_rate numeric,
  confidence numeric NOT NULL DEFAULT 0.5, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_customer_value TO authenticated;
GRANT ALL ON public.roe_customer_value TO service_role;
ALTER TABLE public.roe_customer_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_cv admin read" ON public.roe_customer_value FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_cv service write" ON public.roe_customer_value FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL, current_price numeric, recommended_price numeric NOT NULL,
  expected_conversion_impact numeric, expected_margin_impact numeric,
  expected_revenue_impact_usd numeric, expected_ltv_impact numeric,
  brand_impact text, competitive_position text, rationale text,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'pending_approval',
  approved_by text, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_pricing_recommendations TO authenticated;
GRANT ALL ON public.roe_pricing_recommendations TO service_role;
ALTER TABLE public.roe_pricing_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_pri admin read" ON public.roe_pricing_recommendations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_pri service write" ON public.roe_pricing_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_scaling_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL, target text NOT NULL,
  current_spend_usd numeric, recommended_spend_usd numeric,
  expected_marginal_return numeric, expected_revenue_usd numeric,
  expected_profit_usd numeric, risk numeric, rationale text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_scaling_opportunities TO authenticated;
GRANT ALL ON public.roe_scaling_opportunities TO service_role;
ALTER TABLE public.roe_scaling_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_so admin read" ON public.roe_scaling_opportunities FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_so service write" ON public.roe_scaling_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_executive_scorecard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  revenue_health numeric, profit_health numeric, growth_health numeric,
  efficiency_score numeric, margin_score numeric, capital_efficiency numeric,
  forecast_accuracy numeric, scaling_readiness numeric, business_value_score numeric,
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_executive_scorecard TO authenticated;
GRANT ALL ON public.roe_executive_scorecard TO service_role;
ALTER TABLE public.roe_executive_scorecard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_es admin read" ON public.roe_executive_scorecard FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_es service write" ON public.roe_executive_scorecard FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL, action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_consultations TO authenticated;
GRANT ALL ON public.roe_consultations TO service_role;
ALTER TABLE public.roe_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_co admin read" ON public.roe_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_co service write" ON public.roe_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.roe_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roe_settings TO authenticated;
GRANT ALL ON public.roe_settings TO service_role;
ALTER TABLE public.roe_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roe_set admin read" ON public.roe_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "roe_set service write" ON public.roe_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.roe_portfolio_score(
  revenue_30d numeric, profit_30d numeric, margin_pct numeric,
  growth_pct numeric, trend_score numeric, ltv_score numeric,
  refund_rate numeric, operational_complexity numeric, shipping_cost numeric,
  inventory_stability numeric, expected_future_value_usd numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT
    0.25 * COALESCE(profit_30d, 0) / 1000.0
  + 0.10 * COALESCE(revenue_30d, 0) / 1000.0
  + 0.15 * COALESCE(margin_pct, 0)
  + 0.10 * COALESCE(growth_pct, 0)
  + 0.10 * COALESCE(trend_score, 0)
  + 0.10 * COALESCE(ltv_score, 0)
  + 0.10 * COALESCE(inventory_stability, 0)
  + 0.05 * COALESCE(expected_future_value_usd, 0) / 1000.0
  - 0.10 * COALESCE(refund_rate, 0)
  - 0.05 * COALESCE(operational_complexity, 0)
  - 0.05 * COALESCE(shipping_cost, 0) / 100.0
$$;
REVOKE ALL ON FUNCTION public.roe_portfolio_score(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roe_portfolio_score(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.roe_compose_scorecard(p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; ue record;
  rev_h numeric; prof_h numeric; grow_h numeric; eff numeric;
  margin numeric; cap_eff numeric; bvs numeric;
BEGIN
  SELECT * INTO s FROM public.roe_snapshots WHERE snapshot_date = p_date AND source = 'composite' LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO s FROM public.roe_snapshots WHERE snapshot_date = p_date LIMIT 1; END IF;
  SELECT * INTO ue FROM public.roe_unit_economics WHERE snapshot_date = p_date LIMIT 1;
  rev_h := LEAST(1, GREATEST(0, COALESCE(s.revenue, 0) / NULLIF(5000, 0)));
  prof_h := LEAST(1, GREATEST(0, COALESCE(s.net_margin, 0) / NULLIF(1000, 0)));
  grow_h := LEAST(1, GREATEST(0, COALESCE(s.roas, 0) / 4.0));
  eff := LEAST(1, GREATEST(0, COALESCE(ue.ltv_cac_ratio, 0) / 3.0));
  margin := LEAST(1, GREATEST(0, COALESCE(ue.gross_margin_pct, 0)));
  cap_eff := LEAST(1, GREATEST(0, 1 - COALESCE(ue.customer_payback_days, 90) / 180.0));
  bvs := 0.25*rev_h + 0.25*prof_h + 0.15*grow_h + 0.15*eff + 0.10*margin + 0.10*cap_eff;
  INSERT INTO public.roe_executive_scorecard(
    snapshot_date, revenue_health, profit_health, growth_health,
    efficiency_score, margin_score, capital_efficiency, business_value_score
  ) VALUES (p_date, rev_h, prof_h, grow_h, eff, margin, cap_eff, bvs)
  ON CONFLICT (snapshot_date) DO UPDATE SET
    revenue_health = EXCLUDED.revenue_health,
    profit_health = EXCLUDED.profit_health,
    growth_health = EXCLUDED.growth_health,
    efficiency_score = EXCLUDED.efficiency_score,
    margin_score = EXCLUDED.margin_score,
    capital_efficiency = EXCLUDED.capital_efficiency,
    business_value_score = EXCLUDED.business_value_score;
  RETURN jsonb_build_object('date', p_date, 'business_value_score', bvs);
END $$;
REVOKE ALL ON FUNCTION public.roe_compose_scorecard(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roe_compose_scorecard(date) TO service_role;
