
-- ===== Wave 5X — ACI schema =====

-- 1. settings (singleton)
CREATE TABLE public.aci_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kill_switch boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'simulation' CHECK (mode IN ('auto','approval','simulation','dry_run')),
  daily_ai_budget_usd numeric NOT NULL DEFAULT 1.00,
  daily_cloud_budget_usd numeric NOT NULL DEFAULT 2.00,
  max_tasks_per_day int NOT NULL DEFAULT 50,
  autonomy_level int NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 5),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aci_settings TO authenticated;
GRANT ALL ON public.aci_settings TO service_role;
ALTER TABLE public.aci_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_settings_admin_read ON public.aci_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY aci_settings_admin_write ON public.aci_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.aci_settings (mode) VALUES ('simulation');

-- 2. runs + steps
CREATE TABLE public.aci_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  mode text NOT NULL DEFAULT 'simulation',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  ai_cost_usd numeric DEFAULT 0,
  cloud_cost_usd numeric DEFAULT 0,
  metrics jsonb DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.aci_runs TO authenticated;
GRANT ALL ON public.aci_runs TO service_role;
ALTER TABLE public.aci_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_runs_admin ON public.aci_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.aci_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.aci_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  payload jsonb,
  error text
);
GRANT SELECT ON public.aci_run_steps TO authenticated;
GRANT ALL ON public.aci_run_steps TO service_role;
ALTER TABLE public.aci_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_run_steps_admin ON public.aci_run_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 3. audit log
CREATE TABLE public.aci_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'system',
  engine text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb,
  before_state jsonb,
  after_state jsonb,
  reversible_token uuid
);
GRANT SELECT ON public.aci_audit_log TO authenticated;
GRANT ALL ON public.aci_audit_log TO service_role;
ALTER TABLE public.aci_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_audit_admin ON public.aci_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 4. budget ledger
CREATE TABLE public.aci_budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL DEFAULT current_date,
  engine text NOT NULL,
  ai_cost_usd numeric NOT NULL DEFAULT 0,
  cloud_cost_usd numeric NOT NULL DEFAULT 0,
  request_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, engine)
);
GRANT SELECT ON public.aci_budget_ledger TO authenticated;
GRANT ALL ON public.aci_budget_ledger TO service_role;
ALTER TABLE public.aci_budget_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_budget_admin ON public.aci_budget_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 5. approvals
CREATE TABLE public.aci_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid,
  recommendation_id uuid,
  title text NOT NULL,
  risk text NOT NULL DEFAULT 'low',
  expected_revenue_cents bigint DEFAULT 0,
  expected_cost_usd numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  payload jsonb,
  decided_by uuid,
  decided_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.aci_approvals TO authenticated;
GRANT ALL ON public.aci_approvals TO service_role;
ALTER TABLE public.aci_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_approvals_admin_read ON public.aci_approvals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY aci_approvals_admin_write ON public.aci_approvals FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. rollbacks
CREATE TABLE public.aci_rollbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reversible_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  entity_type text,
  entity_id text,
  snapshot jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  status text NOT NULL DEFAULT 'reversible'
);
GRANT SELECT ON public.aci_rollbacks TO authenticated;
GRANT ALL ON public.aci_rollbacks TO service_role;
ALTER TABLE public.aci_rollbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_rollbacks_admin ON public.aci_rollbacks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 7. market signals
CREATE TABLE public.aci_market_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  signal_type text NOT NULL,
  entity text NOT NULL,
  category text,
  score numeric DEFAULT 0,
  velocity numeric DEFAULT 0,
  confidence numeric DEFAULT 0.5,
  expected_lifetime_days int,
  seasonality jsonb,
  payload jsonb
);
GRANT SELECT ON public.aci_market_signals TO authenticated;
GRANT ALL ON public.aci_market_signals TO service_role;
ALTER TABLE public.aci_market_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_market_signals_admin ON public.aci_market_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX aci_signals_captured_idx ON public.aci_market_signals (captured_at DESC);
CREATE INDEX aci_signals_entity_idx ON public.aci_market_signals (entity);

-- 8. competitors
CREATE TABLE public.aci_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  niche text,
  threat_score numeric DEFAULT 0,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_scanned_at timestamptz,
  metadata jsonb
);
GRANT SELECT ON public.aci_competitors TO authenticated;
GRANT ALL ON public.aci_competitors TO service_role;
ALTER TABLE public.aci_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_competitors_admin ON public.aci_competitors FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 9. competitor snapshots
CREATE TABLE public.aci_competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES public.aci_competitors(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,
  prices_summary jsonb,
  new_products jsonb,
  top_pages jsonb,
  media_quality numeric,
  seo_score numeric,
  pinterest_visibility numeric,
  shopping_visibility numeric,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competitor_id, snapshot_date)
);
GRANT SELECT ON public.aci_competitor_snapshots TO authenticated;
GRANT ALL ON public.aci_competitor_snapshots TO service_role;
ALTER TABLE public.aci_competitor_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_competitor_snap_admin ON public.aci_competitor_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 10. competitor gaps
CREATE TABLE public.aci_competitor_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES public.aci_competitors(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  price_gap numeric DEFAULT 0,
  media_gap numeric DEFAULT 0,
  seo_gap numeric DEFAULT 0,
  content_gap numeric DEFAULT 0,
  trust_gap numeric DEFAULT 0,
  conversion_gap numeric DEFAULT 0,
  overall_threat numeric DEFAULT 0,
  notes text
);
GRANT SELECT ON public.aci_competitor_gaps TO authenticated;
GRANT ALL ON public.aci_competitor_gaps TO service_role;
ALTER TABLE public.aci_competitor_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_competitor_gaps_admin ON public.aci_competitor_gaps FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 11. opportunity v2
CREATE TABLE public.aci_product_opportunity_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  growth_score numeric DEFAULT 0,
  pinterest_score numeric DEFAULT 0,
  ga4_score numeric DEFAULT 0,
  gsc_score numeric DEFAULT 0,
  inventory_score numeric DEFAULT 0,
  margin_score numeric DEFAULT 0,
  price_score numeric DEFAULT 0,
  ctr_score numeric DEFAULT 0,
  cvr_score numeric DEFAULT 0,
  revenue_score numeric DEFAULT 0,
  media_score numeric DEFAULT 0,
  reviews_score numeric DEFAULT 0,
  trend_score numeric DEFAULT 0,
  demand_score numeric DEFAULT 0,
  competition_score numeric DEFAULT 0,
  seasonality_score numeric DEFAULT 0,
  overall_score numeric DEFAULT 0,
  investment_priority text DEFAULT 'medium',
  expected_roi numeric DEFAULT 0,
  expected_revenue_increase_cents bigint DEFAULT 0,
  expected_ctr_delta_pct numeric DEFAULT 0,
  expected_pinterest_delta_pct numeric DEFAULT 0,
  expected_seo_delta_pct numeric DEFAULT 0,
  rank int,
  UNIQUE(product_id, computed_at)
);
GRANT SELECT ON public.aci_product_opportunity_v2 TO authenticated;
GRANT ALL ON public.aci_product_opportunity_v2 TO service_role;
ALTER TABLE public.aci_product_opportunity_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_opp_v2_admin ON public.aci_product_opportunity_v2 FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX aci_opp_v2_rank_idx ON public.aci_product_opportunity_v2 (computed_at DESC, rank);

-- 12. revenue intelligence
CREATE TABLE public.aci_revenue_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  day date NOT NULL DEFAULT current_date,
  profit_cents bigint DEFAULT 0,
  margin_pct numeric DEFAULT 0,
  shipping_cost_cents bigint DEFAULT 0,
  conversion_pct numeric DEFAULT 0,
  refund_risk numeric DEFAULT 0,
  ad_roi numeric DEFAULT 0,
  ltv_cents bigint DEFAULT 0,
  dead_inventory boolean DEFAULT false,
  lost_revenue_cents bigint DEFAULT 0,
  notes text,
  UNIQUE(product_id, day)
);
GRANT SELECT ON public.aci_revenue_intelligence TO authenticated;
GRANT ALL ON public.aci_revenue_intelligence TO service_role;
ALTER TABLE public.aci_revenue_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_rev_intel_admin ON public.aci_revenue_intelligence FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 13. forecasts
CREATE TABLE public.aci_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at timestamptz NOT NULL DEFAULT now(),
  horizon_days int NOT NULL,
  metric text NOT NULL,
  entity text,
  predicted numeric,
  low numeric,
  high numeric,
  confidence numeric,
  model_version text DEFAULT 'ewma+linreg'
);
GRANT SELECT ON public.aci_forecasts TO authenticated;
GRANT ALL ON public.aci_forecasts TO service_role;
ALTER TABLE public.aci_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_forecasts_admin ON public.aci_forecasts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 14. recommendations
CREATE TABLE public.aci_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  engine text NOT NULL,
  recommendation_type text NOT NULL,
  entity_type text,
  entity_id text,
  title text NOT NULL,
  rationale text,
  expected_revenue_cents bigint DEFAULT 0,
  expected_profit_cents bigint DEFAULT 0,
  confidence numeric DEFAULT 0.5,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low','ignore')),
  risk text NOT NULL DEFAULT 'low',
  ai_cost_usd numeric DEFAULT 0,
  cloud_cost_usd numeric DEFAULT 0,
  completion_minutes int DEFAULT 5,
  dependencies jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','queued','approved','rejected','done','expired')),
  payload jsonb
);
GRANT SELECT, UPDATE ON public.aci_recommendations TO authenticated;
GRANT ALL ON public.aci_recommendations TO service_role;
ALTER TABLE public.aci_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_rec_admin_read ON public.aci_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY aci_rec_admin_write ON public.aci_recommendations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 15. tasks
CREATE TABLE public.aci_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  recommendation_id uuid REFERENCES public.aci_recommendations(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','requires_approval','dispatched','done','failed','skipped','simulated')),
  requires_approval boolean DEFAULT false,
  dispatched_at timestamptz,
  finished_at timestamptz,
  output jsonb,
  error text
);
GRANT SELECT ON public.aci_tasks TO authenticated;
GRANT ALL ON public.aci_tasks TO service_role;
ALTER TABLE public.aci_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_tasks_admin ON public.aci_tasks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 16. learning events + weights
CREATE TABLE public.aci_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  axis text,
  delta numeric,
  outcome text,
  payload jsonb
);
GRANT SELECT ON public.aci_learning_events TO authenticated;
GRANT ALL ON public.aci_learning_events TO service_role;
ALTER TABLE public.aci_learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_learning_admin ON public.aci_learning_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.aci_score_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL DEFAULT 1,
  weights jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aci_score_weights TO authenticated;
GRANT ALL ON public.aci_score_weights TO service_role;
ALTER TABLE public.aci_score_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY aci_weights_admin ON public.aci_score_weights FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.aci_score_weights (version, weights, active) VALUES (
  1,
  '{"growth":0.15,"pinterest":0.10,"ga4":0.05,"gsc":0.05,"inventory":0.05,"margin":0.10,"price":0.05,"ctr":0.05,"cvr":0.05,"revenue":0.10,"media":0.05,"reviews":0.03,"trend":0.07,"demand":0.05,"competition":0.03,"seasonality":0.02}'::jsonb,
  true
);
