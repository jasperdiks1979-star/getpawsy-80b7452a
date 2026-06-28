
CREATE OR REPLACE FUNCTION public.gad_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- MODULES
CREATE TABLE public.gad_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  concept_count int NOT NULL DEFAULT 0,
  avg_confidence numeric NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_modules TO authenticated;
GRANT ALL ON public.gad_modules TO service_role;
ALTER TABLE public.gad_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_modules admin read" ON public.gad_modules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_modules service write" ON public.gad_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gad_modules_touch BEFORE UPDATE ON public.gad_modules FOR EACH ROW EXECUTE FUNCTION public.gad_touch_updated_at();

-- CONCEPTS
CREATE TABLE public.gad_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.gad_modules(key) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence_count int NOT NULL DEFAULT 0,
  positive_evidence int NOT NULL DEFAULT 0,
  negative_evidence int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evidence_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, key)
);
GRANT SELECT ON public.gad_concepts TO authenticated;
GRANT ALL ON public.gad_concepts TO service_role;
ALTER TABLE public.gad_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_concepts admin read" ON public.gad_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_concepts service write" ON public.gad_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gad_concepts_touch BEFORE UPDATE ON public.gad_concepts FOR EACH ROW EXECUTE FUNCTION public.gad_touch_updated_at();
CREATE INDEX idx_gad_concepts_module ON public.gad_concepts(module_key);

CREATE TABLE public.gad_concept_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.gad_concepts(id) ON DELETE CASCADE,
  module_key text NOT NULL, concept_key text NOT NULL,
  version int NOT NULL, weight numeric, confidence numeric, evidence_count int,
  snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_concept_history TO authenticated;
GRANT ALL ON public.gad_concept_history TO service_role;
ALTER TABLE public.gad_concept_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_hist admin read" ON public.gad_concept_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_hist service write" ON public.gad_concept_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gad_concepts_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gad_concept_history(concept_id, module_key, concept_key, version, weight, confidence, evidence_count, snapshot)
    VALUES (NEW.id, NEW.module_key, NEW.key, NEW.version, NEW.weight, NEW.confidence, NEW.evidence_count, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gad_concepts_snap BEFORE UPDATE ON public.gad_concepts FOR EACH ROW EXECUTE FUNCTION public.gad_concepts_snapshot();

-- DATA SOURCES
CREATE TABLE public.gad_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  trust_score numeric NOT NULL DEFAULT 0.5,
  freshness_seconds int,
  last_ingest_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_data_sources TO authenticated;
GRANT ALL ON public.gad_data_sources TO service_role;
ALTER TABLE public.gad_data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_src admin read" ON public.gad_data_sources FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_src service write" ON public.gad_data_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gad_src_touch BEFORE UPDATE ON public.gad_data_sources FOR EACH ROW EXECUTE FUNCTION public.gad_touch_updated_at();

-- EVENTS (normalized stream)
CREATE TABLE public.gad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  source_key text,
  session_id text, visitor_id text,
  device text, country text,
  product_id uuid, creative_id text, board_id text,
  campaign text, traffic_source text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinterest_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  tiktok_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  revenue_usd numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_score numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_events TO authenticated;
GRANT ALL ON public.gad_events TO service_role;
ALTER TABLE public.gad_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_events admin read" ON public.gad_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_events service write" ON public.gad_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gad_events_time ON public.gad_events(occurred_at DESC);
CREATE INDEX idx_gad_events_name ON public.gad_events(event_name);
CREATE INDEX idx_gad_events_session ON public.gad_events(session_id);

-- METRICS (rollups with confidence)
CREATE TABLE public.gad_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  scope text NOT NULL DEFAULT 'global',
  scope_ref text,
  value numeric,
  completeness numeric, freshness numeric, sampling numeric,
  consistency numeric, latency_ms int,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_key, snapshot_date, scope, scope_ref)
);
GRANT SELECT ON public.gad_metrics TO authenticated;
GRANT ALL ON public.gad_metrics TO service_role;
ALTER TABLE public.gad_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_metrics admin read" ON public.gad_metrics FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_metrics service write" ON public.gad_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gad_metrics_touch BEFORE UPDATE ON public.gad_metrics FOR EACH ROW EXECUTE FUNCTION public.gad_touch_updated_at();
CREATE INDEX idx_gad_metrics_key_date ON public.gad_metrics(metric_key, snapshot_date DESC);

-- TRUTH VALIDATIONS
CREATE TABLE public.gad_truth_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  scope text, scope_ref text,
  source_a text NOT NULL, value_a numeric,
  source_b text NOT NULL, value_b numeric,
  delta_abs numeric, delta_pct numeric,
  status text NOT NULL DEFAULT 'open',
  confidence numeric NOT NULL DEFAULT 0.5,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_truth_validations TO authenticated;
GRANT ALL ON public.gad_truth_validations TO service_role;
ALTER TABLE public.gad_truth_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_truth admin read" ON public.gad_truth_validations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_truth service write" ON public.gad_truth_validations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ANOMALIES
CREATE TABLE public.gad_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  anomaly_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  scope text, scope_ref text,
  observed numeric, expected numeric, z_score numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'open',
  root_cause text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.gad_anomalies TO authenticated;
GRANT ALL ON public.gad_anomalies TO service_role;
ALTER TABLE public.gad_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_anom admin read" ON public.gad_anomalies FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_anom service write" ON public.gad_anomalies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FUNNEL SNAPSHOTS
CREATE TABLE public.gad_funnel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  step text NOT NULL,
  step_order int NOT NULL,
  visitors int NOT NULL DEFAULT 0,
  conversions int NOT NULL DEFAULT 0,
  drop_rate numeric,
  estimated_lost_revenue numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, step)
);
GRANT SELECT ON public.gad_funnel_snapshots TO authenticated;
GRANT ALL ON public.gad_funnel_snapshots TO service_role;
ALTER TABLE public.gad_funnel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_funnel admin read" ON public.gad_funnel_snapshots FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_funnel service write" ON public.gad_funnel_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ATTRIBUTIONS
CREATE TABLE public.gad_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id text NOT NULL,
  model text NOT NULL,
  channel text NOT NULL,
  creative_id text,
  campaign text,
  weight numeric NOT NULL DEFAULT 0,
  revenue_usd numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_attributions TO authenticated;
GRANT ALL ON public.gad_attributions TO service_role;
ALTER TABLE public.gad_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_attr admin read" ON public.gad_attributions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_attr service write" ON public.gad_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gad_attr_conv ON public.gad_attributions(conversion_id);

-- ROOT CAUSES
CREATE TABLE public.gad_root_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id uuid REFERENCES public.gad_anomalies(id) ON DELETE SET NULL,
  hypothesis text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  causal_chain text[] NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0.5,
  verdict text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_root_causes TO authenticated;
GRANT ALL ON public.gad_root_causes TO service_role;
ALTER TABLE public.gad_root_causes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_rc admin read" ON public.gad_root_causes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_rc service write" ON public.gad_root_causes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- EXPERIMENTS
CREATE TABLE public.gad_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  hypothesis text NOT NULL,
  expected_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  revenue_impact_usd numeric,
  profit_impact_usd numeric,
  winner text, loser text,
  p_value numeric, significance text,
  confidence numeric NOT NULL DEFAULT 0.5,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_experiments TO authenticated;
GRANT ALL ON public.gad_experiments TO service_role;
ALTER TABLE public.gad_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_exp admin read" ON public.gad_experiments FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_exp service write" ON public.gad_experiments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gad_exp_touch BEFORE UPDATE ON public.gad_experiments FOR EACH ROW EXECUTE FUNCTION public.gad_touch_updated_at();

-- FORECASTS
CREATE TABLE public.gad_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_type text NOT NULL,
  scope text, scope_ref text,
  predicted_value numeric NOT NULL,
  ci_low numeric, ci_high numeric,
  actual_value numeric,
  accuracy_score numeric,
  predicted_for date,
  model_version int NOT NULL DEFAULT 1,
  engine_source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.gad_forecasts TO authenticated;
GRANT ALL ON public.gad_forecasts TO service_role;
ALTER TABLE public.gad_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_fc admin read" ON public.gad_forecasts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_fc service write" ON public.gad_forecasts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI DECISION AUDIT
CREATE TABLE public.gad_ai_decision_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  decision text NOT NULL,
  reason text,
  confidence numeric NOT NULL DEFAULT 0.5,
  expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_outcome jsonb,
  financial_impact_usd numeric,
  learning text,
  status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.gad_ai_decision_audit TO authenticated;
GRANT ALL ON public.gad_ai_decision_audit TO service_role;
ALTER TABLE public.gad_ai_decision_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_aud admin read" ON public.gad_ai_decision_audit FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_aud service write" ON public.gad_ai_decision_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- KNOWLEDGE GRAPH
CREATE TABLE public.gad_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  ref_id text NOT NULL,
  label text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gad_graph_nodes TO authenticated;
GRANT ALL ON public.gad_graph_nodes TO service_role;
ALTER TABLE public.gad_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_nodes admin read" ON public.gad_graph_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_nodes service write" ON public.gad_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gad_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gad_graph_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gad_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_graph_edges TO authenticated;
GRANT ALL ON public.gad_graph_edges TO service_role;
ALTER TABLE public.gad_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_edges admin read" ON public.gad_graph_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_edges service write" ON public.gad_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CONSULTATIONS
CREATE TABLE public.gad_engine_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_engine_consultations TO authenticated;
GRANT ALL ON public.gad_engine_consultations TO service_role;
ALTER TABLE public.gad_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_consult admin read" ON public.gad_engine_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_consult service write" ON public.gad_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gad_consult_eng_time ON public.gad_engine_consultations(engine_source, created_at DESC);

-- SETTINGS
CREATE TABLE public.gad_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gad_settings TO authenticated;
GRANT ALL ON public.gad_settings TO service_role;
ALTER TABLE public.gad_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gad_settings admin read" ON public.gad_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gad_settings service write" ON public.gad_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- HELPERS
CREATE OR REPLACE FUNCTION public.gad_upsert_concept(
  p_module text, p_key text, p_name text, p_weight numeric, p_confidence numeric,
  p_description text DEFAULT NULL, p_tags text[] DEFAULT '{}', p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gad_concepts(module_key, key, name, description, weight, confidence, tags, metadata)
  VALUES (p_module, p_key, p_name, p_description, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5), COALESCE(p_tags,'{}'), COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT (module_key, key) DO UPDATE
    SET name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, public.gad_concepts.description),
        weight = EXCLUDED.weight,
        confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = public.gad_concepts.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gad_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gad_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gad_refresh_module_rollups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gad_modules m
  SET concept_count = sub.cnt,
      avg_confidence = COALESCE(sub.avg_conf,0),
      updated_at = now()
  FROM (
    SELECT module_key, COUNT(*) cnt, AVG(confidence) avg_conf
    FROM public.gad_concepts WHERE is_active = true
    GROUP BY module_key
  ) sub
  WHERE m.key = sub.module_key;
END $$;
REVOKE ALL ON FUNCTION public.gad_refresh_module_rollups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gad_refresh_module_rollups() TO service_role;
