
-- =========================================================
-- GENESIS CREATIVE DNA (GCD)
-- =========================================================

CREATE OR REPLACE FUNCTION public.gcd_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- MODULES ----------
CREATE TABLE public.gcd_modules (
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
GRANT SELECT ON public.gcd_modules TO authenticated;
GRANT ALL ON public.gcd_modules TO service_role;
ALTER TABLE public.gcd_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_modules admin read" ON public.gcd_modules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_modules service write" ON public.gcd_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcd_modules_touch BEFORE UPDATE ON public.gcd_modules FOR EACH ROW EXECUTE FUNCTION public.gcd_touch_updated_at();

-- ---------- CONCEPTS ----------
CREATE TABLE public.gcd_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES public.gcd_modules(key) ON DELETE CASCADE,
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
GRANT SELECT ON public.gcd_concepts TO authenticated;
GRANT ALL ON public.gcd_concepts TO service_role;
ALTER TABLE public.gcd_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_concepts admin read" ON public.gcd_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_concepts service write" ON public.gcd_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcd_concepts_touch BEFORE UPDATE ON public.gcd_concepts FOR EACH ROW EXECUTE FUNCTION public.gcd_touch_updated_at();
CREATE INDEX idx_gcd_concepts_module ON public.gcd_concepts(module_key);

CREATE TABLE public.gcd_concept_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.gcd_concepts(id) ON DELETE CASCADE,
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
GRANT SELECT ON public.gcd_concept_history TO authenticated;
GRANT ALL ON public.gcd_concept_history TO service_role;
ALTER TABLE public.gcd_concept_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_history admin read" ON public.gcd_concept_history FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_history service write" ON public.gcd_concept_history FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gcd_concepts_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.weight IS DISTINCT FROM NEW.weight)
     OR (OLD.confidence IS DISTINCT FROM NEW.confidence)
     OR (OLD.evidence_count IS DISTINCT FROM NEW.evidence_count) THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    INSERT INTO public.gcd_concept_history(concept_id, module_key, concept_key, version, weight, confidence, evidence_count, snapshot)
    VALUES (NEW.id, NEW.module_key, NEW.key, NEW.version, NEW.weight, NEW.confidence, NEW.evidence_count, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gcd_concepts_snapshot BEFORE UPDATE ON public.gcd_concepts FOR EACH ROW EXECUTE FUNCTION public.gcd_concepts_snapshot();

-- ---------- CREATIVES (genome) ----------
CREATE TABLE public.gcd_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text UNIQUE NOT NULL,
  generation_id text,
  parent_creative_id text,
  creative_family text,
  creative_version int NOT NULL DEFAULT 1,
  image_fingerprint text,
  video_fingerprint text,
  prompt text,
  prompt_version int,
  seed bigint,
  render_provider text,
  generation_cost_usd numeric,
  generation_time_ms int,
  creator_engine text,
  pipeline_version text,
  product_id uuid,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_creatives TO authenticated;
GRANT ALL ON public.gcd_creatives TO service_role;
ALTER TABLE public.gcd_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_creatives admin read" ON public.gcd_creatives FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_creatives service write" ON public.gcd_creatives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcd_creatives_touch BEFORE UPDATE ON public.gcd_creatives FOR EACH ROW EXECUTE FUNCTION public.gcd_touch_updated_at();
CREATE INDEX idx_gcd_creatives_family ON public.gcd_creatives(creative_family);
CREATE INDEX idx_gcd_creatives_parent ON public.gcd_creatives(parent_creative_id);

-- ---------- VISUAL DNA ----------
CREATE TABLE public.gcd_visual_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text UNIQUE NOT NULL,
  camera text, lens text, perspective text, focal_length text, depth_of_field text,
  lighting text, light_direction text, light_temperature text,
  weather text, season text, time_of_day text,
  environment text, indoor boolean, outdoor boolean,
  background text, foreground text,
  composition text, rule_of_thirds boolean, leading_lines boolean,
  negative_space numeric, framing text,
  object_count int, human_presence boolean, pet_presence boolean,
  breed text, age text, pose text, facial_expression text, eye_contact boolean,
  motion text, interaction text, story text,
  visual_hierarchy text,
  typography text, headline_position text, badge text, cta text, brand_placement text,
  color_palette text[] NOT NULL DEFAULT '{}',
  contrast numeric, brightness numeric, saturation numeric, warmth numeric, texture text,
  luxury_score numeric, minimalism_score numeric, clutter_score numeric,
  product_visibility_score numeric,
  attention_flow text[] NOT NULL DEFAULT '{}',
  emotion_primary text, emotion_secondary text,
  psychological_trigger text, desired_feeling text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_visual_dna TO authenticated;
GRANT ALL ON public.gcd_visual_dna TO service_role;
ALTER TABLE public.gcd_visual_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_visual_dna admin read" ON public.gcd_visual_dna FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_visual_dna service write" ON public.gcd_visual_dna FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcd_visual_touch BEFORE UPDATE ON public.gcd_visual_dna FOR EACH ROW EXECUTE FUNCTION public.gcd_touch_updated_at();
CREATE INDEX idx_gcd_visual_emotion ON public.gcd_visual_dna(emotion_primary);
CREATE INDEX idx_gcd_visual_story ON public.gcd_visual_dna(story);

-- ---------- GENES (evolves per family) ----------
CREATE TABLE public.gcd_genes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family text NOT NULL DEFAULT 'global',
  gene_type text NOT NULL,
  gene_value text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence_count int NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evidence_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family, gene_type, gene_value)
);
GRANT SELECT ON public.gcd_genes TO authenticated;
GRANT ALL ON public.gcd_genes TO service_role;
ALTER TABLE public.gcd_genes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_genes admin read" ON public.gcd_genes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_genes service write" ON public.gcd_genes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcd_genes_touch BEFORE UPDATE ON public.gcd_genes FOR EACH ROW EXECUTE FUNCTION public.gcd_touch_updated_at();
CREATE INDEX idx_gcd_genes_family_type ON public.gcd_genes(family, gene_type);

-- ---------- PERFORMANCE ----------
CREATE TABLE public.gcd_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  add_to_cart int NOT NULL DEFAULT 0,
  checkouts int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_usd numeric NOT NULL DEFAULT 0,
  profit_usd numeric NOT NULL DEFAULT 0,
  returns int NOT NULL DEFAULT 0,
  refunds_usd numeric NOT NULL DEFAULT 0,
  ctr numeric, outbound_ctr numeric, save_rate numeric, atc_rate numeric, cvr numeric, roas numeric,
  novelty_score numeric,
  fatigue_score numeric,
  success_score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creative_id, snapshot_date)
);
GRANT SELECT ON public.gcd_performance TO authenticated;
GRANT ALL ON public.gcd_performance TO service_role;
ALTER TABLE public.gcd_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_perf admin read" ON public.gcd_performance FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_perf service write" ON public.gcd_performance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_gcd_perf_touch BEFORE UPDATE ON public.gcd_performance FOR EACH ROW EXECUTE FUNCTION public.gcd_touch_updated_at();
CREATE INDEX idx_gcd_perf_creative ON public.gcd_performance(creative_id, snapshot_date DESC);

-- ---------- PREDICTIONS ----------
CREATE TABLE public.gcd_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text,
  prediction_type text NOT NULL,
  predicted_value numeric NOT NULL,
  ci_low numeric,
  ci_high numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_value numeric,
  outcome_at timestamptz,
  model_version int NOT NULL DEFAULT 1,
  engine_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_predictions TO authenticated;
GRANT ALL ON public.gcd_predictions TO service_role;
ALTER TABLE public.gcd_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_pred admin read" ON public.gcd_predictions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_pred service write" ON public.gcd_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gcd_pred_creative ON public.gcd_predictions(creative_id);

-- ---------- LEARNINGS ----------
CREATE TABLE public.gcd_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  scope text NOT NULL DEFAULT 'concept',
  module_key text,
  concept_key text,
  family text,
  gene_type text,
  gene_value text,
  insight text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  delta_weight numeric,
  delta_confidence numeric,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_learnings TO authenticated;
GRANT ALL ON public.gcd_learnings TO service_role;
ALTER TABLE public.gcd_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_learnings admin read" ON public.gcd_learnings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_learnings service write" ON public.gcd_learnings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- KNOWLEDGE GRAPH ----------
CREATE TABLE public.gcd_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  ref_id text NOT NULL,
  label text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.gcd_graph_nodes TO authenticated;
GRANT ALL ON public.gcd_graph_nodes TO service_role;
ALTER TABLE public.gcd_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_nodes admin read" ON public.gcd_graph_nodes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_nodes service write" ON public.gcd_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gcd_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.gcd_graph_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.gcd_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_graph_edges TO authenticated;
GRANT ALL ON public.gcd_graph_edges TO service_role;
ALTER TABLE public.gcd_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_edges admin read" ON public.gcd_graph_edges FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_edges service write" ON public.gcd_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- ENGINE CONSULTATIONS ----------
CREATE TABLE public.gcd_engine_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_source text NOT NULL,
  action text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_engine_consultations TO authenticated;
GRANT ALL ON public.gcd_engine_consultations TO service_role;
ALTER TABLE public.gcd_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_consult admin read" ON public.gcd_engine_consultations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_consult service write" ON public.gcd_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_gcd_consult_engine_time ON public.gcd_engine_consultations(engine_source, created_at DESC);

-- ---------- SETTINGS ----------
CREATE TABLE public.gcd_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gcd_settings TO authenticated;
GRANT ALL ON public.gcd_settings TO service_role;
ALTER TABLE public.gcd_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcd_settings admin read" ON public.gcd_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "gcd_settings service write" ON public.gcd_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- HELPERS ----------
CREATE OR REPLACE FUNCTION public.gcd_upsert_concept(
  p_module text, p_key text, p_name text, p_weight numeric, p_confidence numeric,
  p_description text DEFAULT NULL, p_tags text[] DEFAULT '{}', p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gcd_concepts(module_key, key, name, description, weight, confidence, tags, metadata)
  VALUES (p_module, p_key, p_name, p_description, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5), COALESCE(p_tags,'{}'), COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT (module_key, key) DO UPDATE
    SET name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, public.gcd_concepts.description),
        weight = EXCLUDED.weight,
        confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = public.gcd_concepts.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gcd_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gcd_upsert_concept(text,text,text,numeric,numeric,text,text[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gcd_upsert_gene(
  p_family text, p_type text, p_value text, p_weight numeric DEFAULT NULL, p_confidence numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.gcd_genes(family, gene_type, gene_value, weight, confidence)
  VALUES (COALESCE(p_family,'global'), p_type, p_value, COALESCE(p_weight,0.5), COALESCE(p_confidence,0.5))
  ON CONFLICT (family, gene_type, gene_value) DO UPDATE
    SET weight = COALESCE(EXCLUDED.weight, public.gcd_genes.weight),
        confidence = COALESCE(EXCLUDED.confidence, public.gcd_genes.confidence)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.gcd_upsert_gene(text,text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gcd_upsert_gene(text,text,text,numeric,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.gcd_refresh_module_rollups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gcd_modules m
  SET concept_count = sub.cnt,
      avg_confidence = COALESCE(sub.avg_conf,0),
      updated_at = now()
  FROM (
    SELECT module_key, COUNT(*) cnt, AVG(confidence) avg_conf
    FROM public.gcd_concepts WHERE is_active = true
    GROUP BY module_key
  ) sub
  WHERE m.key = sub.module_key;
END $$;
REVOKE ALL ON FUNCTION public.gcd_refresh_module_rollups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gcd_refresh_module_rollups() TO service_role;
