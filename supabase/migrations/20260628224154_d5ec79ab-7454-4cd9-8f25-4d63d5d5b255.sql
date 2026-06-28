
CREATE OR REPLACE FUNCTION public.gkg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- NODES
CREATE TABLE public.gkg_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  ref_id text NOT NULL,
  label text NOT NULL,
  description text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.7,
  importance numeric NOT NULL DEFAULT 0.5,
  source_dna text,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gkg_nodes TO authenticated;
GRANT ALL ON public.gkg_nodes TO service_role;
ALTER TABLE public.gkg_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_nodes admin read" ON public.gkg_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_nodes service write" ON public.gkg_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gkg_nodes_touch BEFORE UPDATE ON public.gkg_nodes FOR EACH ROW EXECUTE FUNCTION public.gkg_touch_updated_at();
CREATE INDEX idx_gkg_nodes_type ON public.gkg_nodes(node_type);
CREATE INDEX idx_gkg_nodes_label_trgm ON public.gkg_nodes USING gin (label gin_trgm_ops);

-- NODE HISTORY
CREATE TABLE public.gkg_node_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.gkg_nodes(id) ON DELETE CASCADE,
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gkg_node_history TO authenticated;
GRANT ALL ON public.gkg_node_history TO service_role;
ALTER TABLE public.gkg_node_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_nh admin read" ON public.gkg_node_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_nh service write" ON public.gkg_node_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gkg_nodes_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.importance IS DISTINCT FROM NEW.importance)
     OR (OLD.attributes IS DISTINCT FROM NEW.attributes)
     OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gkg_node_history(node_id, version, snapshot)
    VALUES (NEW.id, NEW.version, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gkg_nodes_snap BEFORE UPDATE ON public.gkg_nodes FOR EACH ROW EXECUTE FUNCTION public.gkg_nodes_snapshot();

-- EDGES
CREATE TABLE public.gkg_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gkg_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gkg_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence_count int NOT NULL DEFAULT 0,
  positive_evidence int NOT NULL DEFAULT 0,
  negative_evidence int NOT NULL DEFAULT 0,
  source_dna text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_node, to_node, relation)
);
GRANT SELECT ON public.gkg_edges TO authenticated;
GRANT ALL ON public.gkg_edges TO service_role;
ALTER TABLE public.gkg_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_edges admin read" ON public.gkg_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_edges service write" ON public.gkg_edges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gkg_edges_touch BEFORE UPDATE ON public.gkg_edges FOR EACH ROW EXECUTE FUNCTION public.gkg_touch_updated_at();
CREATE INDEX idx_gkg_edges_from ON public.gkg_edges(from_node, relation);
CREATE INDEX idx_gkg_edges_to ON public.gkg_edges(to_node, relation);
CREATE INDEX idx_gkg_edges_relation ON public.gkg_edges(relation);

CREATE TABLE public.gkg_edge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id uuid NOT NULL REFERENCES public.gkg_edges(id) ON DELETE CASCADE,
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gkg_edge_history TO authenticated;
GRANT ALL ON public.gkg_edge_history TO service_role;
ALTER TABLE public.gkg_edge_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_eh admin read" ON public.gkg_edge_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_eh service write" ON public.gkg_edge_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gkg_edges_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count)
     OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gkg_edge_history(edge_id, version, snapshot)
    VALUES (NEW.id, NEW.version, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gkg_edges_snap BEFORE UPDATE ON public.gkg_edges FOR EACH ROW EXECUTE FUNCTION public.gkg_edges_snapshot();

-- HYPOTHESES
CREATE TABLE public.gkg_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  hypothesis text NOT NULL,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  counter_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_impact_usd numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  validation_plan text,
  status text NOT NULL DEFAULT 'open', -- open|validating|validated|rejected|stale
  source_engine text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.gkg_hypotheses TO authenticated;
GRANT ALL ON public.gkg_hypotheses TO service_role;
ALTER TABLE public.gkg_hypotheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_hyp admin read" ON public.gkg_hypotheses FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_hyp service write" ON public.gkg_hypotheses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gkg_hyp_status ON public.gkg_hypotheses(status, created_at DESC);

-- ROOT CAUSES
CREATE TABLE public.gkg_root_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom text NOT NULL,
  cause_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  root_cause text NOT NULL,
  evidence_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  related_nodes uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.gkg_root_causes TO authenticated;
GRANT ALL ON public.gkg_root_causes TO service_role;
ALTER TABLE public.gkg_root_causes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_rc admin read" ON public.gkg_root_causes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_rc service write" ON public.gkg_root_causes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- COUNTERFACTUALS
CREATE TABLE public.gkg_counterfactuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL,
  intervention jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  predicted_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_impact_usd numeric,
  risk_score numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'simulated', -- simulated only — never auto-executed
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gkg_counterfactuals TO authenticated;
GRANT ALL ON public.gkg_counterfactuals TO service_role;
ALTER TABLE public.gkg_counterfactuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_cf admin read" ON public.gkg_counterfactuals FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_cf service write" ON public.gkg_counterfactuals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- REASONING TRACES
CREATE TABLE public.gkg_reasoning_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  source_engine text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  conclusion text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_outcome jsonb,
  learning text,
  consulted_dna text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  outcome_at timestamptz
);
GRANT SELECT ON public.gkg_reasoning_traces TO authenticated;
GRANT ALL ON public.gkg_reasoning_traces TO service_role;
ALTER TABLE public.gkg_reasoning_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_rt admin read" ON public.gkg_reasoning_traces FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_rt service write" ON public.gkg_reasoning_traces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gkg_rt_engine_time ON public.gkg_reasoning_traces(source_engine, created_at DESC);

-- DECISION BRIEFS
CREATE TABLE public.gkg_decision_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_topic text NOT NULL,
  target_consumer text NOT NULL, -- growth_director|executive_board|revenue_ai|creative_ai|pricing_ai|governance
  summary text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_business_value_usd numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'prepared',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gkg_decision_briefs TO authenticated;
GRANT ALL ON public.gkg_decision_briefs TO service_role;
ALTER TABLE public.gkg_decision_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_db admin read" ON public.gkg_decision_briefs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_db service write" ON public.gkg_decision_briefs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- LONG TERM MEMORY
CREATE TABLE public.gkg_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type text NOT NULL, -- success|failure|discovery|strategic_lesson|prediction|experiment
  title text NOT NULL,
  body text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  importance numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.7,
  embedding jsonb,
  related_nodes uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz
);
GRANT SELECT ON public.gkg_memory TO authenticated;
GRANT ALL ON public.gkg_memory TO service_role;
ALTER TABLE public.gkg_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_mem admin read" ON public.gkg_memory FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_mem service write" ON public.gkg_memory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gkg_mem_tags ON public.gkg_memory USING gin (tags);
CREATE INDEX idx_gkg_mem_title_trgm ON public.gkg_memory USING gin (title gin_trgm_ops);

-- CONTRADICTIONS
CREATE TABLE public.gkg_contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  conflicting_edges uuid[] NOT NULL DEFAULT '{}',
  conflicting_memories uuid[] NOT NULL DEFAULT '{}',
  severity numeric NOT NULL DEFAULT 0.5,
  resolution_status text NOT NULL DEFAULT 'open', -- open|resolved|monitoring
  resolution_note text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.gkg_contradictions TO authenticated;
GRANT ALL ON public.gkg_contradictions TO service_role;
ALTER TABLE public.gkg_contradictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_cn admin read" ON public.gkg_contradictions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_cn service write" ON public.gkg_contradictions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CONSULTATIONS (audit)
CREATE TABLE public.gkg_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gkg_consultations TO authenticated;
GRANT ALL ON public.gkg_consultations TO service_role;
ALTER TABLE public.gkg_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_co admin read" ON public.gkg_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_co service write" ON public.gkg_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gkg_co_engine_time ON public.gkg_consultations(engine_source, created_at DESC);

CREATE TABLE public.gkg_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gkg_settings TO authenticated;
GRANT ALL ON public.gkg_settings TO service_role;
ALTER TABLE public.gkg_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gkg_s admin read" ON public.gkg_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gkg_s service write" ON public.gkg_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- HELPERS
CREATE OR REPLACE FUNCTION public.gkg_upsert_node(
  p_type text, p_ref_id text, p_label text,
  p_description text DEFAULT NULL, p_attributes jsonb DEFAULT '{}'::jsonb,
  p_confidence numeric DEFAULT 0.7, p_importance numeric DEFAULT 0.5, p_source_dna text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gkg_nodes(node_type, ref_id, label, description, attributes, confidence, importance, source_dna)
  VALUES (p_type, p_ref_id, p_label, p_description, COALESCE(p_attributes,'{}'::jsonb), COALESCE(p_confidence,0.7), COALESCE(p_importance,0.5), p_source_dna)
  ON CONFLICT (node_type, ref_id) DO UPDATE
    SET label = EXCLUDED.label,
        description = COALESCE(EXCLUDED.description, public.gkg_nodes.description),
        attributes = public.gkg_nodes.attributes || EXCLUDED.attributes,
        confidence = EXCLUDED.confidence, importance = EXCLUDED.importance,
        source_dna = COALESCE(EXCLUDED.source_dna, public.gkg_nodes.source_dna)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gkg_upsert_node(text,text,text,text,jsonb,numeric,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gkg_upsert_node(text,text,text,text,jsonb,numeric,numeric,text) TO service_role;

CREATE OR REPLACE FUNCTION public.gkg_upsert_edge(
  p_from uuid, p_to uuid, p_relation text,
  p_weight numeric DEFAULT 0.5, p_confidence numeric DEFAULT 0.5,
  p_attributes jsonb DEFAULT '{}'::jsonb, p_source_dna text DEFAULT NULL,
  p_positive int DEFAULT 0, p_negative int DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gkg_edges(from_node, to_node, relation, weight, confidence, attributes, source_dna, positive_evidence, negative_evidence, evidence_count)
  VALUES (p_from, p_to, p_relation, p_weight, p_confidence, COALESCE(p_attributes,'{}'::jsonb), p_source_dna, p_positive, p_negative, p_positive + p_negative)
  ON CONFLICT (from_node, to_node, relation) DO UPDATE
    SET weight = (public.gkg_edges.weight * public.gkg_edges.evidence_count + EXCLUDED.weight * (EXCLUDED.evidence_count + 1)) / NULLIF(public.gkg_edges.evidence_count + EXCLUDED.evidence_count + 1, 0),
        confidence = LEAST(0.99, public.gkg_edges.confidence + 0.02),
        positive_evidence = public.gkg_edges.positive_evidence + EXCLUDED.positive_evidence,
        negative_evidence = public.gkg_edges.negative_evidence + EXCLUDED.negative_evidence,
        evidence_count = public.gkg_edges.evidence_count + EXCLUDED.positive_evidence + EXCLUDED.negative_evidence,
        attributes = public.gkg_edges.attributes || EXCLUDED.attributes
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gkg_upsert_edge(uuid,uuid,text,numeric,numeric,jsonb,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gkg_upsert_edge(uuid,uuid,text,numeric,numeric,jsonb,text,int,int) TO service_role;

-- evolve: weekly cleanup
CREATE OR REPLACE FUNCTION public.gkg_evolve()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_retired_edges int := 0;
  v_stale_hyp int := 0;
BEGIN
  -- retire edges with persistent negative evidence and low confidence
  UPDATE public.gkg_edges SET is_active = false
   WHERE is_active = true
     AND confidence < 0.25
     AND evidence_count >= 10
     AND negative_evidence > positive_evidence * 2;
  GET DIAGNOSTICS v_retired_edges = ROW_COUNT;

  UPDATE public.gkg_hypotheses SET status = 'stale'
   WHERE status = 'open' AND created_at < now() - interval '60 days';
  GET DIAGNOSTICS v_stale_hyp = ROW_COUNT;

  RETURN jsonb_build_object('retired_edges', v_retired_edges, 'stale_hypotheses', v_stale_hyp, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.gkg_evolve() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gkg_evolve() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
