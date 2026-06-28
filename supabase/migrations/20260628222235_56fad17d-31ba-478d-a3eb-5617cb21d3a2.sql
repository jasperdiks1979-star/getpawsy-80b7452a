
-- =========================================================
-- GENESIS PINTEREST INTELLIGENCE DNA (GPI)
-- =========================================================

CREATE OR REPLACE FUNCTION public.gpi_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- MODULES ----------
CREATE TABLE public.gpi_modules (
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
GRANT SELECT ON public.gpi_modules TO authenticated;
GRANT ALL ON public.gpi_modules TO service_role;
ALTER TABLE public.gpi_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_modules admin read" ON public.gpi_modules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_modules service write" ON public.gpi_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpi_modules_touch BEFORE UPDATE ON public.gpi_modules FOR EACH ROW EXECUTE FUNCTION public.gpi_touch_updated_at();

-- ---------- CONCEPTS ----------
CREATE TABLE public.gpi_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.gpi_modules(key) ON DELETE CASCADE,
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
GRANT SELECT ON public.gpi_concepts TO authenticated;
GRANT ALL ON public.gpi_concepts TO service_role;
ALTER TABLE public.gpi_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_concepts admin read" ON public.gpi_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_concepts service write" ON public.gpi_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpi_concepts_touch BEFORE UPDATE ON public.gpi_concepts FOR EACH ROW EXECUTE FUNCTION public.gpi_touch_updated_at();
CREATE INDEX idx_gpi_concepts_module ON public.gpi_concepts(module_key);

-- ---------- CONCEPT HISTORY ----------
CREATE TABLE public.gpi_concept_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.gpi_concepts(id) ON DELETE CASCADE,
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
GRANT SELECT ON public.gpi_concept_history TO authenticated;
GRANT ALL ON public.gpi_concept_history TO service_role;
ALTER TABLE public.gpi_concept_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_history admin read" ON public.gpi_concept_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_history service write" ON public.gpi_concept_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gpi_concepts_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gpi_concept_history(concept_id, module_key, concept_key, version, weight, confidence, evidence_count, snapshot)
    VALUES (NEW.id, NEW.module_key, NEW.key, NEW.version, NEW.weight, NEW.confidence, NEW.evidence_count, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gpi_concepts_snapshot BEFORE UPDATE ON public.gpi_concepts FOR EACH ROW EXECUTE FUNCTION public.gpi_concepts_snapshot();

-- ---------- PIN DNA (permanent fingerprint) ----------
CREATE TABLE public.gpi_pin_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text UNIQUE NOT NULL,
  product_id uuid,
  board_id text,
  image_fingerprint text,
  creative_family text,
  visual_style text,
  typography text,
  headline text,
  hook text,
  story text,
  cta text,
  emotion text,
  scene text,
  camera_angle text,
  lighting text,
  colors text[] NOT NULL DEFAULT '{}',
  badge text,
  offer text,
  category text,
  publish_time timestamptz,
  publish_weekday smallint,
  publish_hour smallint,
  season text,
  device text,
  traffic_source text,
  target_market text NOT NULL DEFAULT 'US',
  language text NOT NULL DEFAULT 'en',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpi_pin_dna TO authenticated;
GRANT ALL ON public.gpi_pin_dna TO service_role;
ALTER TABLE public.gpi_pin_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_pin_dna admin read" ON public.gpi_pin_dna FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_pin_dna service write" ON public.gpi_pin_dna FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpi_pin_dna_touch BEFORE UPDATE ON public.gpi_pin_dna FOR EACH ROW EXECUTE FUNCTION public.gpi_touch_updated_at();
CREATE INDEX idx_gpi_pin_dna_family ON public.gpi_pin_dna(creative_family);
CREATE INDEX idx_gpi_pin_dna_category ON public.gpi_pin_dna(category);
CREATE INDEX idx_gpi_pin_dna_emotion ON public.gpi_pin_dna(emotion);

-- ---------- PERFORMANCE (daily rollups per pin) ----------
CREATE TABLE public.gpi_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  closeups int NOT NULL DEFAULT 0,
  comments int NOT NULL DEFAULT 0,
  profile_visits int NOT NULL DEFAULT 0,
  follows int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_usd numeric NOT NULL DEFAULT 0,
  profit_usd numeric NOT NULL DEFAULT 0,
  ctr numeric,
  outbound_ctr numeric,
  save_rate numeric,
  cvr numeric,
  roas numeric,
  cac numeric,
  ltv numeric,
  success_score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, snapshot_date)
);
GRANT SELECT ON public.gpi_performance TO authenticated;
GRANT ALL ON public.gpi_performance TO service_role;
ALTER TABLE public.gpi_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_perf admin read" ON public.gpi_performance FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_perf service write" ON public.gpi_performance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gpi_perf_touch BEFORE UPDATE ON public.gpi_performance FOR EACH ROW EXECUTE FUNCTION public.gpi_touch_updated_at();
CREATE INDEX idx_gpi_perf_pin ON public.gpi_performance(pin_id, snapshot_date DESC);

-- ---------- PREDICTIONS ----------
CREATE TABLE public.gpi_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text,
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
GRANT SELECT ON public.gpi_predictions TO authenticated;
GRANT ALL ON public.gpi_predictions TO service_role;
ALTER TABLE public.gpi_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_predictions admin read" ON public.gpi_predictions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_predictions service write" ON public.gpi_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gpi_predictions_pin ON public.gpi_predictions(pin_id);
CREATE INDEX idx_gpi_predictions_type ON public.gpi_predictions(prediction_type);

-- ---------- LEARNINGS LEDGER ----------
CREATE TABLE public.gpi_learnings (
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
GRANT SELECT ON public.gpi_learnings TO authenticated;
GRANT ALL ON public.gpi_learnings TO service_role;
ALTER TABLE public.gpi_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_learnings admin read" ON public.gpi_learnings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_learnings service write" ON public.gpi_learnings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- KNOWLEDGE GRAPH ----------
CREATE TABLE public.gpi_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  ref_id text NOT NULL,
  label text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gpi_graph_nodes TO authenticated;
GRANT ALL ON public.gpi_graph_nodes TO service_role;
ALTER TABLE public.gpi_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_nodes admin read" ON public.gpi_graph_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_nodes service write" ON public.gpi_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gpi_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gpi_graph_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gpi_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpi_graph_edges TO authenticated;
GRANT ALL ON public.gpi_graph_edges TO service_role;
ALTER TABLE public.gpi_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_edges admin read" ON public.gpi_graph_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_edges service write" ON public.gpi_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- ENGINE CONSULTATIONS ----------
CREATE TABLE public.gpi_engine_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpi_engine_consultations TO authenticated;
GRANT ALL ON public.gpi_engine_consultations TO service_role;
ALTER TABLE public.gpi_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_consult admin read" ON public.gpi_engine_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_consult service write" ON public.gpi_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gpi_consult_engine_time ON public.gpi_engine_consultations(engine_source, created_at DESC);

-- ---------- SETTINGS ----------
CREATE TABLE public.gpi_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpi_settings TO authenticated;
GRANT ALL ON public.gpi_settings TO service_role;
ALTER TABLE public.gpi_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpi_settings admin read" ON public.gpi_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gpi_settings service write" ON public.gpi_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- HELPERS ----------
CREATE OR REPLACE FUNCTION public.gpi_upsert_concept(
  p_module text, p_key text, p_name text, p_weight numeric, p_confidence numeric,
  p_description text DEFAULT NULL, p_tags text[] DEFAULT '{}', p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gpi_concepts(module_key, key, name, description, weight, confidence, tags, metadata)
  VALUES (p_module, p_key, p_name, p_description, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5), COALESCE(p_tags,'{}'), COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT (module_key, key) DO UPDATE
    SET name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, public.gpi_concepts.description),
        weight = EXCLUDED.weight,
        confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = public.gpi_concepts.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gpi_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gpi_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gpi_refresh_module_rollups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gpi_modules m
  SET concept_count = sub.cnt,
      avg_confidence = COALESCE(sub.avg_conf,0),
      updated_at = now()
  FROM (
    SELECT module_key, COUNT(*) cnt, AVG(confidence) avg_conf
    FROM public.gpi_concepts WHERE is_active = true
    GROUP BY module_key
  ) sub
  WHERE m.key = sub.module_key;
END $$;
REVOKE ALL ON FUNCTION public.gpi_refresh_module_rollups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gpi_refresh_module_rollups() TO service_role;

-- Weighted Pinterest Success Score (computed in SQL too for ad-hoc queries)
CREATE OR REPLACE FUNCTION public.gpi_success_score(
  p_ctr numeric, p_outbound_ctr numeric, p_save_rate numeric,
  p_cvr numeric, p_roas numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, LEAST(100,
    COALESCE(p_ctr,0)         * 100 * 0.10 +
    COALESCE(p_outbound_ctr,0)* 100 * 0.20 +
    COALESCE(p_save_rate,0)   * 100 * 0.15 +
    COALESCE(p_cvr,0)         * 100 * 0.25 +
    LEAST(COALESCE(p_roas,0)*10, 30)
  ))
$$;
