
CREATE OR REPLACE FUNCTION public.gmd_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- MODULES
CREATE TABLE public.gmd_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, name text NOT NULL, description text, category text NOT NULL,
  concept_count int NOT NULL DEFAULT 0, avg_confidence numeric NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_modules TO authenticated;
GRANT ALL ON public.gmd_modules TO service_role;
ALTER TABLE public.gmd_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_modules admin read" ON public.gmd_modules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_modules service write" ON public.gmd_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gmd_mod_touch BEFORE UPDATE ON public.gmd_modules FOR EACH ROW EXECUTE FUNCTION public.gmd_touch_updated_at();

-- CONCEPTS + history
CREATE TABLE public.gmd_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.gmd_modules(key) ON DELETE CASCADE,
  key text NOT NULL, name text NOT NULL, description text,
  weight numeric NOT NULL DEFAULT 0.5, confidence numeric NOT NULL DEFAULT 0.5,
  evidence_count int NOT NULL DEFAULT 0, positive_evidence int NOT NULL DEFAULT 0, negative_evidence int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evidence_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, key)
);
GRANT SELECT ON public.gmd_concepts TO authenticated;
GRANT ALL ON public.gmd_concepts TO service_role;
ALTER TABLE public.gmd_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_concepts admin read" ON public.gmd_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_concepts service write" ON public.gmd_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gmd_con_touch BEFORE UPDATE ON public.gmd_concepts FOR EACH ROW EXECUTE FUNCTION public.gmd_touch_updated_at();
CREATE INDEX idx_gmd_con_mod ON public.gmd_concepts(module_key);

CREATE TABLE public.gmd_concept_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.gmd_concepts(id) ON DELETE CASCADE,
  module_key text NOT NULL, concept_key text NOT NULL, version int NOT NULL,
  weight numeric, confidence numeric, evidence_count int,
  snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_concept_history TO authenticated;
GRANT ALL ON public.gmd_concept_history TO service_role;
ALTER TABLE public.gmd_concept_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_hist admin read" ON public.gmd_concept_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_hist service write" ON public.gmd_concept_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gmd_concepts_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gmd_concept_history(concept_id, module_key, concept_key, version, weight, confidence, evidence_count, snapshot)
    VALUES (NEW.id, NEW.module_key, NEW.key, NEW.version, NEW.weight, NEW.confidence, NEW.evidence_count, to_jsonb(NEW));
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_gmd_con_snap BEFORE UPDATE ON public.gmd_concepts FOR EACH ROW EXECUTE FUNCTION public.gmd_concepts_snapshot();

-- REGIONS
CREATE TABLE public.gmd_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL, tier text NOT NULL DEFAULT 'secondary',
  population_millions numeric, pet_ownership_pct numeric,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_regions TO authenticated;
GRANT ALL ON public.gmd_regions TO service_role;
ALTER TABLE public.gmd_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_regions admin read" ON public.gmd_regions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_regions service write" ON public.gmd_regions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CATEGORIES
CREATE TABLE public.gmd_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, name text NOT NULL,
  region_code text DEFAULT 'US',
  growth numeric, demand numeric, competition numeric, profitability numeric,
  trend_strength numeric, seasonality jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_categories TO authenticated;
GRANT ALL ON public.gmd_categories TO service_role;
ALTER TABLE public.gmd_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_cat admin read" ON public.gmd_categories FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_cat service write" ON public.gmd_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- TRENDS
CREATE TABLE public.gmd_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  trend_type text NOT NULL,  -- emerging|exploding|stable|declining|dead
  category_key text, region_code text DEFAULT 'US',
  signal_strength numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.5,
  expected_duration_days int,
  business_impact_usd numeric,
  revenue_opportunity_usd numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_trends TO authenticated;
GRANT ALL ON public.gmd_trends TO service_role;
ALTER TABLE public.gmd_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_tr admin read" ON public.gmd_trends FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_tr service write" ON public.gmd_trends FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gmd_trends_status ON public.gmd_trends(status, signal_strength DESC);

-- SEARCH SIGNALS
CREATE TABLE public.gmd_search_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- pinterest|google|shopping|image
  query text NOT NULL,
  region_code text DEFAULT 'US',
  volume int, growth_pct numeric,
  seasonality jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_intent numeric, difficulty numeric,
  related_products uuid[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_search_signals TO authenticated;
GRANT ALL ON public.gmd_search_signals TO service_role;
ALTER TABLE public.gmd_search_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_ss admin read" ON public.gmd_search_signals FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_ss service write" ON public.gmd_search_signals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gmd_ss_query ON public.gmd_search_signals(source, query);

-- COMPETITORS (public observation only)
CREATE TABLE public.gmd_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text UNIQUE,
  region_code text DEFAULT 'US',
  tier text DEFAULT 'mid',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_competitors TO authenticated;
GRANT ALL ON public.gmd_competitors TO service_role;
ALTER TABLE public.gmd_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_comp admin read" ON public.gmd_competitors FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_comp service write" ON public.gmd_competitors FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gmd_competitor_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES public.gmd_competitors(id) ON DELETE CASCADE,
  observation_type text NOT NULL, -- category|pricing|creative|content|seasonal|messaging|trust
  summary text NOT NULL,
  principle text, -- abstracted lesson (never copy)
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_competitor_observations TO authenticated;
GRANT ALL ON public.gmd_competitor_observations TO service_role;
ALTER TABLE public.gmd_competitor_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_co admin read" ON public.gmd_competitor_observations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_co service write" ON public.gmd_competitor_observations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PRICING LANDSCAPE
CREATE TABLE public.gmd_pricing_landscape (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL,
  region_code text DEFAULT 'US',
  premium_price numeric, mid_price numeric, budget_price numeric, average_price numeric,
  dispersion numeric, elasticity numeric,
  price_war_intensity numeric, promo_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_pricing_landscape TO authenticated;
GRANT ALL ON public.gmd_pricing_landscape TO service_role;
ALTER TABLE public.gmd_pricing_landscape ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_pl admin read" ON public.gmd_pricing_landscape FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_pl service write" ON public.gmd_pricing_landscape FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ECONOMIC SIGNALS
CREATE TABLE public.gmd_economic_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL, -- inflation|confidence|fuel|shipping|import|supply|currency|holiday_spend
  region_code text DEFAULT 'US',
  value numeric, unit text,
  direction text DEFAULT 'flat',
  business_impact_score numeric, -- -1..1
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_economic_signals TO authenticated;
GRANT ALL ON public.gmd_economic_signals TO service_role;
ALTER TABLE public.gmd_economic_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_es admin read" ON public.gmd_economic_signals FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_es service write" ON public.gmd_economic_signals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SEASONS
CREATE TABLE public.gmd_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, name text NOT NULL,
  start_doy int, end_doy int,
  region_code text DEFAULT 'US',
  demand_curve jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_seasons TO authenticated;
GRANT ALL ON public.gmd_seasons TO service_role;
ALTER TABLE public.gmd_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_se admin read" ON public.gmd_seasons FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_se service write" ON public.gmd_seasons FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gmd_season_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_key text NOT NULL REFERENCES public.gmd_seasons(key) ON DELETE CASCADE,
  recommendation_type text NOT NULL, -- creative|product|inventory|publishing
  recommendation text NOT NULL,
  category_key text,
  priority numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_season_recommendations TO authenticated;
GRANT ALL ON public.gmd_season_recommendations TO service_role;
ALTER TABLE public.gmd_season_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_sr admin read" ON public.gmd_season_recommendations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_sr service write" ON public.gmd_season_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- REGIONAL PROFILES
CREATE TABLE public.gmd_regional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code text NOT NULL, sub_region text NOT NULL,
  climate text, pet_ownership_pct numeric,
  buying_habits jsonb NOT NULL DEFAULT '{}'::jsonb,
  seasonality jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifestyle jsonb NOT NULL DEFAULT '{}'::jsonb,
  housing jsonb NOT NULL DEFAULT '{}'::jsonb,
  outdoor_behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_code, sub_region)
);
GRANT SELECT ON public.gmd_regional_profiles TO authenticated;
GRANT ALL ON public.gmd_regional_profiles TO service_role;
ALTER TABLE public.gmd_regional_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_rp admin read" ON public.gmd_regional_profiles FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_rp service write" ON public.gmd_regional_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SOCIAL TRENDS
CREATE TABLE public.gmd_social_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_label text NOT NULL,
  visual_type text NOT NULL, -- aesthetic|photography|video|lifestyle|interior|color|typography|pet_lifestyle
  signal_strength numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.5,
  creative_dna_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_social_trends TO authenticated;
GRANT ALL ON public.gmd_social_trends TO service_role;
ALTER TABLE public.gmd_social_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_st admin read" ON public.gmd_social_trends FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_st service write" ON public.gmd_social_trends FOR ALL TO service_role USING (true) WITH CHECK (true);

-- OPPORTUNITIES
CREATE TABLE public.gmd_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_type text NOT NULL, -- niche|category|product|audience|seasonal|pricing|creative|seo|pinterest|tiktok
  label text NOT NULL,
  category_key text, region_code text DEFAULT 'US',
  rank_score numeric NOT NULL DEFAULT 0,
  expected_revenue_usd numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_opportunities TO authenticated;
GRANT ALL ON public.gmd_opportunities TO service_role;
ALTER TABLE public.gmd_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_op admin read" ON public.gmd_opportunities FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_op service write" ON public.gmd_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gmd_op_rank ON public.gmd_opportunities(rank_score DESC) WHERE status='open';

-- RISKS
CREATE TABLE public.gmd_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_type text NOT NULL,
  label text NOT NULL,
  probability numeric NOT NULL DEFAULT 0.5,
  severity numeric NOT NULL DEFAULT 0.5,
  time_horizon_days int,
  expected_business_impact_usd numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_risks TO authenticated;
GRANT ALL ON public.gmd_risks TO service_role;
ALTER TABLE public.gmd_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_rk admin read" ON public.gmd_risks FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_rk service write" ON public.gmd_risks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FORECASTS
CREATE TABLE public.gmd_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_type text NOT NULL, -- demand|revenue|profit|category_growth|search|pinterest|creative|inventory|marketing_budget
  subject_key text, region_code text DEFAULT 'US',
  horizon_days int NOT NULL DEFAULT 30,
  predicted_value numeric NOT NULL,
  ci_low numeric, ci_high numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_value numeric, outcome_at timestamptz,
  model_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_forecasts TO authenticated;
GRANT ALL ON public.gmd_forecasts TO service_role;
ALTER TABLE public.gmd_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_fc admin read" ON public.gmd_forecasts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_fc service write" ON public.gmd_forecasts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- KNOWLEDGE GRAPH
CREATE TABLE public.gmd_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL, ref_id text NOT NULL,
  label text NOT NULL, attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gmd_graph_nodes TO authenticated;
GRANT ALL ON public.gmd_graph_nodes TO service_role;
ALTER TABLE public.gmd_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_nodes admin read" ON public.gmd_graph_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_nodes service write" ON public.gmd_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gmd_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gmd_graph_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gmd_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5, confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_graph_edges TO authenticated;
GRANT ALL ON public.gmd_graph_edges TO service_role;
ALTER TABLE public.gmd_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_edges admin read" ON public.gmd_graph_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_edges service write" ON public.gmd_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CONSULT / AUDIT
CREATE TABLE public.gmd_engine_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL, action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_engine_consultations TO authenticated;
GRANT ALL ON public.gmd_engine_consultations TO service_role;
ALTER TABLE public.gmd_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_consult admin read" ON public.gmd_engine_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_consult service write" ON public.gmd_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gmd_consult_eng_time ON public.gmd_engine_consultations(engine_source, created_at DESC);

-- ASSUMPTION LOG (weekly retirement)
CREATE TABLE public.gmd_assumption_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text, concept_key text,
  assumption text NOT NULL,
  status text NOT NULL DEFAULT 'active', -- active|retired|validated
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);
GRANT SELECT ON public.gmd_assumption_log TO authenticated;
GRANT ALL ON public.gmd_assumption_log TO service_role;
ALTER TABLE public.gmd_assumption_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_al admin read" ON public.gmd_assumption_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_al service write" ON public.gmd_assumption_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gmd_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gmd_settings TO authenticated;
GRANT ALL ON public.gmd_settings TO service_role;
ALTER TABLE public.gmd_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmd_settings admin read" ON public.gmd_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gmd_settings service write" ON public.gmd_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- HELPERS
CREATE OR REPLACE FUNCTION public.gmd_upsert_concept(
  p_module text, p_key text, p_name text, p_weight numeric, p_confidence numeric,
  p_description text DEFAULT NULL, p_tags text[] DEFAULT '{}', p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gmd_concepts(module_key, key, name, description, weight, confidence, tags, metadata)
  VALUES (p_module, p_key, p_name, p_description, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5), COALESCE(p_tags,'{}'), COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT (module_key, key) DO UPDATE
    SET name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, public.gmd_concepts.description),
        weight = EXCLUDED.weight, confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = public.gmd_concepts.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gmd_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gmd_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gmd_refresh_module_rollups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gmd_modules m
  SET concept_count = sub.cnt, avg_confidence = COALESCE(sub.avg_conf,0), updated_at = now()
  FROM (SELECT module_key, COUNT(*) cnt, AVG(confidence) avg_conf
        FROM public.gmd_concepts WHERE is_active = true GROUP BY module_key) sub
  WHERE m.key = sub.module_key;
END $$;
REVOKE ALL ON FUNCTION public.gmd_refresh_module_rollups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gmd_refresh_module_rollups() TO service_role;
