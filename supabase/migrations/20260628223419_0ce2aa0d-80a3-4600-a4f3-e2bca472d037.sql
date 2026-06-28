
CREATE OR REPLACE FUNCTION public.gpd_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- MODULES
CREATE TABLE public.gpd_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, name text NOT NULL, description text, category text NOT NULL,
  concept_count int NOT NULL DEFAULT 0, avg_confidence numeric NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_modules TO authenticated;
GRANT ALL ON public.gpd_modules TO service_role;
ALTER TABLE public.gpd_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_modules admin read" ON public.gpd_modules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_modules service write" ON public.gpd_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpd_mod_touch BEFORE UPDATE ON public.gpd_modules FOR EACH ROW EXECUTE FUNCTION public.gpd_touch_updated_at();

-- CONCEPTS + history
CREATE TABLE public.gpd_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.gpd_modules(key) ON DELETE CASCADE,
  key text NOT NULL, name text NOT NULL, description text,
  weight numeric NOT NULL DEFAULT 0.5, confidence numeric NOT NULL DEFAULT 0.5,
  evidence_count int NOT NULL DEFAULT 0, positive_evidence int NOT NULL DEFAULT 0, negative_evidence int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evidence_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, key)
);
GRANT SELECT ON public.gpd_concepts TO authenticated;
GRANT ALL ON public.gpd_concepts TO service_role;
ALTER TABLE public.gpd_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_concepts admin read" ON public.gpd_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_concepts service write" ON public.gpd_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpd_con_touch BEFORE UPDATE ON public.gpd_concepts FOR EACH ROW EXECUTE FUNCTION public.gpd_touch_updated_at();
CREATE INDEX idx_gpd_con_mod ON public.gpd_concepts(module_key);

CREATE TABLE public.gpd_concept_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.gpd_concepts(id) ON DELETE CASCADE,
  module_key text NOT NULL, concept_key text NOT NULL, version int NOT NULL,
  weight numeric, confidence numeric, evidence_count int,
  snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_concept_history TO authenticated;
GRANT ALL ON public.gpd_concept_history TO service_role;
ALTER TABLE public.gpd_concept_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_hist admin read" ON public.gpd_concept_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_hist service write" ON public.gpd_concept_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gpd_concepts_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gpd_concept_history(concept_id, module_key, concept_key, version, weight, confidence, evidence_count, snapshot)
    VALUES (NEW.id, NEW.module_key, NEW.key, NEW.version, NEW.weight, NEW.confidence, NEW.evidence_count, to_jsonb(NEW));
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_gpd_con_snap BEFORE UPDATE ON public.gpd_concepts FOR EACH ROW EXECUTE FUNCTION public.gpd_concepts_snapshot();

-- PRODUCT GENOME
CREATE TABLE public.gpd_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid UNIQUE NOT NULL,
  supplier text, supplier_product_id text, cj_product_id text,
  category text, subcategory text, tags text[] NOT NULL DEFAULT '{}',
  brand text, material text, dimensions jsonb, weight_g numeric,
  shipping_profile text,
  launch_date date,
  lifecycle_stage text NOT NULL DEFAULT 'new',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_products TO authenticated;
GRANT ALL ON public.gpd_products TO service_role;
ALTER TABLE public.gpd_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_products admin read" ON public.gpd_products FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_products service write" ON public.gpd_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpd_prod_touch BEFORE UPDATE ON public.gpd_products FOR EACH ROW EXECUTE FUNCTION public.gpd_touch_updated_at();
CREATE INDEX idx_gpd_products_cat ON public.gpd_products(category);
CREATE INDEX idx_gpd_products_life ON public.gpd_products(lifecycle_stage);

-- COMMERCIAL
CREATE TABLE public.gpd_commercial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  current_price numeric, cost_price numeric, shipping_cost numeric, import_cost numeric,
  transaction_fees numeric, ad_cost numeric,
  expected_margin_pct numeric, actual_margin_pct numeric,
  gross_profit numeric, net_profit numeric, contribution_margin numeric,
  breakeven_roas numeric, breakeven_cpa numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, snapshot_date)
);
GRANT SELECT ON public.gpd_commercial TO authenticated;
GRANT ALL ON public.gpd_commercial TO service_role;
ALTER TABLE public.gpd_commercial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_comm admin read" ON public.gpd_commercial FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_comm service write" ON public.gpd_commercial FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpd_comm_touch BEFORE UPDATE ON public.gpd_commercial FOR EACH ROW EXECUTE FUNCTION public.gpd_touch_updated_at();

CREATE TABLE public.gpd_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  price numeric NOT NULL, currency text NOT NULL DEFAULT 'USD',
  reason text, source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_price_history TO authenticated;
GRANT ALL ON public.gpd_price_history TO service_role;
ALTER TABLE public.gpd_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_ph admin read" ON public.gpd_price_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_ph service write" ON public.gpd_price_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gpd_ph_prod ON public.gpd_price_history(product_id, created_at DESC);

-- CUSTOMER FIT
CREATE TABLE public.gpd_customer_fit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  segment text NOT NULL,
  probability numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, segment)
);
GRANT SELECT ON public.gpd_customer_fit TO authenticated;
GRANT ALL ON public.gpd_customer_fit TO service_role;
ALTER TABLE public.gpd_customer_fit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_cf admin read" ON public.gpd_customer_fit FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_cf service write" ON public.gpd_customer_fit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- INTENT
CREATE TABLE public.gpd_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid UNIQUE NOT NULL,
  purchase_probability numeric, impulse_score numeric, gift_potential numeric,
  urgency_score numeric, seasonality_score numeric, trust_score numeric,
  repeat_purchase_probability numeric, refund_probability numeric, return_probability numeric,
  ltv_impact numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_intent TO authenticated;
GRANT ALL ON public.gpd_intent TO service_role;
ALTER TABLE public.gpd_intent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_int admin read" ON public.gpd_intent FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_int service write" ON public.gpd_intent FOR ALL TO service_role USING (true) WITH CHECK (true);

-- HEALTH
CREATE TABLE public.gpd_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  sales_velocity numeric, conversion_rate numeric, margin numeric,
  inventory_health numeric, shipping_speed numeric, refund_rate numeric,
  customer_satisfaction numeric, pinterest_performance numeric, creative_performance numeric,
  trend_score numeric, seasonality numeric,
  overall_score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, snapshot_date)
);
GRANT SELECT ON public.gpd_health TO authenticated;
GRANT ALL ON public.gpd_health TO service_role;
ALTER TABLE public.gpd_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_h admin read" ON public.gpd_health FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_h service write" ON public.gpd_health FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpd_h_touch BEFORE UPDATE ON public.gpd_health FOR EACH ROW EXECUTE FUNCTION public.gpd_touch_updated_at();
CREATE INDEX idx_gpd_h_prod ON public.gpd_health(product_id, snapshot_date DESC);

-- OPPORTUNITIES
CREATE TABLE public.gpd_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  opportunity_type text NOT NULL,
  recommendation text NOT NULL,
  expected_revenue_gain_usd numeric,
  expected_profit_gain_usd numeric,
  priority numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'open',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
GRANT SELECT ON public.gpd_opportunities TO authenticated;
GRANT ALL ON public.gpd_opportunities TO service_role;
ALTER TABLE public.gpd_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_op admin read" ON public.gpd_opportunities FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_op service write" ON public.gpd_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gpd_op_pri ON public.gpd_opportunities(priority DESC) WHERE status = 'open';

-- TRENDS
CREATE TABLE public.gpd_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  trend_type text NOT NULL,
  source text NOT NULL,
  signal_strength numeric NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'flat',
  seasonality jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_trends TO authenticated;
GRANT ALL ON public.gpd_trends TO service_role;
ALTER TABLE public.gpd_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_tr admin read" ON public.gpd_trends FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_tr service write" ON public.gpd_trends FOR ALL TO service_role USING (true) WITH CHECK (true);

-- BUNDLES
CREATE TABLE public.gpd_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_product_id uuid NOT NULL,
  accessory_product_ids uuid[] NOT NULL DEFAULT '{}',
  bundle_type text NOT NULL DEFAULT 'cross_sell',
  expected_aov_lift numeric, expected_profit_lift numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_bundles TO authenticated;
GRANT ALL ON public.gpd_bundles TO service_role;
ALTER TABLE public.gpd_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_bd admin read" ON public.gpd_bundles FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_bd service write" ON public.gpd_bundles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PRICE RECOMMENDATIONS (approval gated)
CREATE TABLE public.gpd_price_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  current_price numeric NOT NULL,
  recommended_price numeric NOT NULL,
  elasticity numeric, expected_revenue_lift_usd numeric, expected_profit_lift_usd numeric,
  reason text, confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'pending_approval',
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_price_recommendations TO authenticated;
GRANT ALL ON public.gpd_price_recommendations TO service_role;
ALTER TABLE public.gpd_price_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_pr admin read" ON public.gpd_price_recommendations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_pr service write" ON public.gpd_price_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- INVENTORY
CREATE TABLE public.gpd_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid UNIQUE NOT NULL,
  supplier_stock int, warehouse text, shipping_time_days int,
  warehouse_stability numeric, variant_availability numeric,
  stockout_risk numeric, oversupply_risk numeric, supplier_reliability numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_inventory TO authenticated;
GRANT ALL ON public.gpd_inventory TO service_role;
ALTER TABLE public.gpd_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_inv admin read" ON public.gpd_inventory FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_inv service write" ON public.gpd_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CREATIVE MATCH
CREATE TABLE public.gpd_creative_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  best_story text, best_emotion text, best_headline text,
  best_camera text, best_color_palette text[] NOT NULL DEFAULT '{}',
  best_typography text, best_board text, best_cta text,
  best_season text, best_audience text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
GRANT SELECT ON public.gpd_creative_match TO authenticated;
GRANT ALL ON public.gpd_creative_match TO service_role;
ALTER TABLE public.gpd_creative_match ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_cm admin read" ON public.gpd_creative_match FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_cm service write" ON public.gpd_creative_match FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PREDICTIONS
CREATE TABLE public.gpd_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  prediction_type text NOT NULL,
  predicted_value numeric NOT NULL,
  ci_low numeric, ci_high numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_value numeric, outcome_at timestamptz,
  model_version int NOT NULL DEFAULT 1, engine_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_predictions TO authenticated;
GRANT ALL ON public.gpd_predictions TO service_role;
ALTER TABLE public.gpd_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_pred admin read" ON public.gpd_predictions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_pred service write" ON public.gpd_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- DISCOVERY (new CJ products / emerging categories / market gaps)
CREATE TABLE public.gpd_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_type text NOT NULL,
  external_id text, category text, label text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  brand_fit numeric, expected_revenue_usd numeric,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_discovery TO authenticated;
GRANT ALL ON public.gpd_discovery TO service_role;
ALTER TABLE public.gpd_discovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_disc admin read" ON public.gpd_discovery FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_disc service write" ON public.gpd_discovery FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RELATIONSHIPS / KNOWLEDGE GRAPH
CREATE TABLE public.gpd_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL, ref_id text NOT NULL,
  label text NOT NULL, attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gpd_graph_nodes TO authenticated;
GRANT ALL ON public.gpd_graph_nodes TO service_role;
ALTER TABLE public.gpd_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_nodes admin read" ON public.gpd_graph_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_nodes service write" ON public.gpd_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gpd_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gpd_graph_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gpd_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5, confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_graph_edges TO authenticated;
GRANT ALL ON public.gpd_graph_edges TO service_role;
ALTER TABLE public.gpd_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_edges admin read" ON public.gpd_graph_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_edges service write" ON public.gpd_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gpd_engine_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL, action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_engine_consultations TO authenticated;
GRANT ALL ON public.gpd_engine_consultations TO service_role;
ALTER TABLE public.gpd_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_consult admin read" ON public.gpd_engine_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_consult service write" ON public.gpd_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gpd_consult_eng_time ON public.gpd_engine_consultations(engine_source, created_at DESC);

CREATE TABLE public.gpd_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpd_settings TO authenticated;
GRANT ALL ON public.gpd_settings TO service_role;
ALTER TABLE public.gpd_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpd_settings admin read" ON public.gpd_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpd_settings service write" ON public.gpd_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- HELPERS
CREATE OR REPLACE FUNCTION public.gpd_upsert_concept(
  p_module text, p_key text, p_name text, p_weight numeric, p_confidence numeric,
  p_description text DEFAULT NULL, p_tags text[] DEFAULT '{}', p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gpd_concepts(module_key, key, name, description, weight, confidence, tags, metadata)
  VALUES (p_module, p_key, p_name, p_description, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5), COALESCE(p_tags,'{}'), COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT (module_key, key) DO UPDATE
    SET name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, public.gpd_concepts.description),
        weight = EXCLUDED.weight, confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = public.gpd_concepts.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gpd_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gpd_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gpd_refresh_module_rollups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gpd_modules m
  SET concept_count = sub.cnt, avg_confidence = COALESCE(sub.avg_conf,0), updated_at = now()
  FROM (SELECT module_key, COUNT(*) cnt, AVG(confidence) avg_conf
        FROM public.gpd_concepts WHERE is_active = true GROUP BY module_key) sub
  WHERE m.key = sub.module_key;
END $$;
REVOKE ALL ON FUNCTION public.gpd_refresh_module_rollups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gpd_refresh_module_rollups() TO service_role;
