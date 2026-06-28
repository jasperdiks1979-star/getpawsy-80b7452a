
-- =========================================================
-- GENESIS CUSTOMER PSYCHOLOGY DNA (GCP)
-- =========================================================

-- Helper: updated_at trigger fn (reuse pattern)
CREATE OR REPLACE FUNCTION public.gcp_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- MODULES ----------
CREATE TABLE public.gcp_modules (
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
GRANT SELECT ON public.gcp_modules TO authenticated;
GRANT ALL ON public.gcp_modules TO service_role;
ALTER TABLE public.gcp_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_modules admin read" ON public.gcp_modules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_modules service write" ON public.gcp_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcp_modules_touch BEFORE UPDATE ON public.gcp_modules FOR EACH ROW EXECUTE FUNCTION public.gcp_touch_updated_at();

-- ---------- CONCEPTS ----------
CREATE TABLE public.gcp_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.gcp_modules(key) ON DELETE CASCADE,
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
GRANT SELECT ON public.gcp_concepts TO authenticated;
GRANT ALL ON public.gcp_concepts TO service_role;
ALTER TABLE public.gcp_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_concepts admin read" ON public.gcp_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_concepts service write" ON public.gcp_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcp_concepts_touch BEFORE UPDATE ON public.gcp_concepts FOR EACH ROW EXECUTE FUNCTION public.gcp_touch_updated_at();
CREATE INDEX idx_gcp_concepts_module ON public.gcp_concepts(module_key);

-- ---------- CONCEPT HISTORY (immutable) ----------
CREATE TABLE public.gcp_concept_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.gcp_concepts(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  concept_key text NOT NULL,
  version int NOT NULL,
  weight numeric,
  confidence numeric,
  evidence_count int,
  change_reason text,
  changed_by text,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_concept_history TO authenticated;
GRANT ALL ON public.gcp_concept_history TO service_role;
ALTER TABLE public.gcp_concept_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_history admin read" ON public.gcp_concept_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_history service write" ON public.gcp_concept_history FOR INSERT TO service_role WITH CHECK (true);
CREATE INDEX idx_gcp_history_concept ON public.gcp_concept_history(concept_id);

-- Snapshot trigger: write history on UPDATE of weight/confidence/evidence
CREATE OR REPLACE FUNCTION public.gcp_concepts_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gcp_concept_history(concept_id, module_key, concept_key, version, weight, confidence, evidence_count, snapshot)
    VALUES (NEW.id, NEW.module_key, NEW.key, NEW.version, NEW.weight, NEW.confidence, NEW.evidence_count, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gcp_concepts_snapshot BEFORE UPDATE ON public.gcp_concepts FOR EACH ROW EXECUTE FUNCTION public.gcp_concepts_snapshot();

-- ---------- VISITOR PROFILES ----------
CREATE TABLE public.gcp_visitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  session_id text,
  segment_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  emotion_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  objection_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  journey_stage text,
  intent_score numeric NOT NULL DEFAULT 0,
  trust_score numeric NOT NULL DEFAULT 0,
  urgency_score numeric NOT NULL DEFAULT 0,
  price_sensitivity numeric NOT NULL DEFAULT 0.5,
  predicted_ltv numeric,
  confidence numeric NOT NULL DEFAULT 0,
  signal_count int NOT NULL DEFAULT 0,
  last_signal_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visitor_id)
);
GRANT SELECT ON public.gcp_visitor_profiles TO authenticated;
GRANT ALL ON public.gcp_visitor_profiles TO service_role;
ALTER TABLE public.gcp_visitor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_visitors admin read" ON public.gcp_visitor_profiles FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_visitors service write" ON public.gcp_visitor_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcp_visitors_touch BEFORE UPDATE ON public.gcp_visitor_profiles FOR EACH ROW EXECUTE FUNCTION public.gcp_touch_updated_at();
CREATE INDEX idx_gcp_visitors_journey ON public.gcp_visitor_profiles(journey_stage);

-- ---------- PREDICTIONS ----------
CREATE TABLE public.gcp_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text,
  subject_type text NOT NULL,
  subject_id text,
  prediction_type text NOT NULL,
  predicted_value numeric NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_value numeric,
  outcome_at timestamptz,
  model_version int NOT NULL DEFAULT 1,
  engine_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_predictions TO authenticated;
GRANT ALL ON public.gcp_predictions TO service_role;
ALTER TABLE public.gcp_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_predictions admin read" ON public.gcp_predictions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_predictions service write" ON public.gcp_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gcp_predictions_visitor ON public.gcp_predictions(visitor_id);
CREATE INDEX idx_gcp_predictions_type ON public.gcp_predictions(prediction_type);

-- ---------- SIGNALS ----------
CREATE TABLE public.gcp_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text,
  session_id text,
  signal_type text NOT NULL,
  signal_value numeric,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_signals TO authenticated;
GRANT INSERT ON public.gcp_signals TO authenticated;
GRANT ALL ON public.gcp_signals TO service_role;
ALTER TABLE public.gcp_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_signals admin read" ON public.gcp_signals FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_signals client insert" ON public.gcp_signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gcp_signals service write" ON public.gcp_signals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gcp_signals_visitor ON public.gcp_signals(visitor_id);
CREATE INDEX idx_gcp_signals_type_time ON public.gcp_signals(signal_type, created_at DESC);

-- ---------- LEARNINGS LEDGER ----------
CREATE TABLE public.gcp_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  module_key text,
  concept_key text,
  insight text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  delta_weight numeric,
  delta_confidence numeric,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_learnings TO authenticated;
GRANT ALL ON public.gcp_learnings TO service_role;
ALTER TABLE public.gcp_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_learnings admin read" ON public.gcp_learnings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_learnings service write" ON public.gcp_learnings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- KNOWLEDGE GRAPH ----------
CREATE TABLE public.gcp_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  ref_id text NOT NULL,
  label text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gcp_graph_nodes TO authenticated;
GRANT ALL ON public.gcp_graph_nodes TO service_role;
ALTER TABLE public.gcp_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_nodes admin read" ON public.gcp_graph_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_nodes service write" ON public.gcp_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gcp_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gcp_graph_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gcp_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_graph_edges TO authenticated;
GRANT ALL ON public.gcp_graph_edges TO service_role;
ALTER TABLE public.gcp_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_edges admin read" ON public.gcp_graph_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_edges service write" ON public.gcp_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- ENGINE CONSULTATIONS (audit) ----------
CREATE TABLE public.gcp_engine_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_engine_consultations TO authenticated;
GRANT ALL ON public.gcp_engine_consultations TO service_role;
ALTER TABLE public.gcp_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_consult admin read" ON public.gcp_engine_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_consult service write" ON public.gcp_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gcp_consult_engine_time ON public.gcp_engine_consultations(engine_source, created_at DESC);

-- ---------- SETTINGS ----------
CREATE TABLE public.gcp_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcp_settings TO authenticated;
GRANT ALL ON public.gcp_settings TO service_role;
ALTER TABLE public.gcp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcp_settings admin read" ON public.gcp_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcp_settings service write" ON public.gcp_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- HELPER: upsert concept (used by gcp-api) ----------
CREATE OR REPLACE FUNCTION public.gcp_upsert_concept(
  p_module text, p_key text, p_name text, p_weight numeric, p_confidence numeric, p_description text DEFAULT NULL, p_tags text[] DEFAULT '{}', p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gcp_concepts(module_key, key, name, description, weight, confidence, tags, metadata)
  VALUES (p_module, p_key, p_name, p_description, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5), COALESCE(p_tags,'{}'), COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT (module_key, key) DO UPDATE
    SET name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, public.gcp_concepts.description),
        weight = EXCLUDED.weight,
        confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = public.gcp_concepts.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gcp_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gcp_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) TO service_role;

-- ---------- HELPER: recompute module rollups ----------
CREATE OR REPLACE FUNCTION public.gcp_refresh_module_rollups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gcp_modules m
  SET concept_count = sub.cnt,
      avg_confidence = COALESCE(sub.avg_conf,0),
      updated_at = now()
  FROM (
    SELECT module_key, COUNT(*) cnt, AVG(confidence) avg_conf
    FROM public.gcp_concepts WHERE is_active = true
    GROUP BY module_key
  ) sub
  WHERE m.key = sub.module_key;
END $$;
REVOKE ALL ON FUNCTION public.gcp_refresh_module_rollups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gcp_refresh_module_rollups() TO service_role;
