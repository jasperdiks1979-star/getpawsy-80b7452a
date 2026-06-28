
-- Genesis Business DNA: permanent knowledge layer
CREATE TABLE public.gbd_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  completeness NUMERIC NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gbd_modules TO authenticated;
GRANT ALL ON public.gbd_modules TO service_role;
ALTER TABLE public.gbd_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_modules_admin_read ON public.gbd_modules FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_modules_service_all ON public.gbd_modules FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gbd_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL REFERENCES public.gbd_modules(key) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  value JSONB NOT NULL,
  rationale TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'genesis-seed',
  source_engine TEXT,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES public.gbd_facts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_key, topic, fact_key, version)
);
GRANT SELECT ON public.gbd_facts TO authenticated;
GRANT ALL ON public.gbd_facts TO service_role;
ALTER TABLE public.gbd_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_facts_admin_read ON public.gbd_facts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_facts_service_all ON public.gbd_facts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX gbd_facts_current_idx ON public.gbd_facts (module_key, topic, fact_key) WHERE is_current;
CREATE INDEX gbd_facts_tags_idx ON public.gbd_facts USING gin (tags);
CREATE INDEX gbd_facts_value_idx ON public.gbd_facts USING gin (value);

CREATE TABLE public.gbd_fact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL,
  module_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  prev_value JSONB,
  new_value JSONB,
  prev_confidence NUMERIC,
  new_confidence NUMERIC,
  change_reason TEXT,
  changed_by_engine TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gbd_fact_history TO authenticated;
GRANT ALL ON public.gbd_fact_history TO service_role;
ALTER TABLE public.gbd_fact_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_fact_history_admin_read ON public.gbd_fact_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_fact_history_service_all ON public.gbd_fact_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gbd_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type TEXT NOT NULL,
  node_key TEXT NOT NULL,
  label TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (node_type, node_key)
);
GRANT SELECT ON public.gbd_graph_nodes TO authenticated;
GRANT ALL ON public.gbd_graph_nodes TO service_role;
ALTER TABLE public.gbd_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_nodes_admin_read ON public.gbd_graph_nodes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_nodes_service_all ON public.gbd_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gbd_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_id UUID NOT NULL REFERENCES public.gbd_graph_nodes(id) ON DELETE CASCADE,
  dst_id UUID NOT NULL REFERENCES public.gbd_graph_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (src_id, dst_id, relation)
);
GRANT SELECT ON public.gbd_graph_edges TO authenticated;
GRANT ALL ON public.gbd_graph_edges TO service_role;
ALTER TABLE public.gbd_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_edges_admin_read ON public.gbd_graph_edges FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_edges_service_all ON public.gbd_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gbd_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine TEXT NOT NULL,
  module_key TEXT REFERENCES public.gbd_modules(key) ON DELETE SET NULL,
  decision_type TEXT NOT NULL,
  subject TEXT,
  why TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  expected_outcome JSONB,
  actual_outcome JSONB,
  learning TEXT,
  fact_updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gbd_learnings TO authenticated;
GRANT ALL ON public.gbd_learnings TO service_role;
ALTER TABLE public.gbd_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_learnings_admin_read ON public.gbd_learnings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_learnings_service_all ON public.gbd_learnings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gbd_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_ids UUID[] NOT NULL,
  conflict_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT SELECT ON public.gbd_conflicts TO authenticated;
GRANT ALL ON public.gbd_conflicts TO service_role;
ALTER TABLE public.gbd_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_conflicts_admin_read ON public.gbd_conflicts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_conflicts_service_all ON public.gbd_conflicts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gbd_engine_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine TEXT NOT NULL,
  api TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gbd_engine_consultations TO authenticated;
GRANT ALL ON public.gbd_engine_consultations TO service_role;
ALTER TABLE public.gbd_engine_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbd_cons_admin_read ON public.gbd_engine_consultations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY gbd_cons_service_all ON public.gbd_engine_consultations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atomic upsert: supersede the current fact, insert a new version, log history.
CREATE OR REPLACE FUNCTION public.gbd_upsert_fact(
  _module_key TEXT,
  _topic TEXT,
  _fact_key TEXT,
  _value JSONB,
  _confidence NUMERIC,
  _source TEXT,
  _source_engine TEXT,
  _rationale TEXT,
  _evidence JSONB,
  _change_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev RECORD;
  _new_version INT := 1;
  _new_id UUID;
BEGIN
  SELECT id, value, confidence, version INTO _prev
  FROM public.gbd_facts
  WHERE module_key = _module_key AND topic = _topic AND fact_key = _fact_key AND is_current
  LIMIT 1;

  IF FOUND THEN
    _new_version := _prev.version + 1;
    UPDATE public.gbd_facts SET is_current = false, valid_to = now(), updated_at = now()
      WHERE id = _prev.id;
  END IF;

  INSERT INTO public.gbd_facts (
    module_key, topic, fact_key, value, rationale, evidence,
    confidence, source, source_engine, version, is_current
  ) VALUES (
    _module_key, _topic, _fact_key, _value, _rationale, COALESCE(_evidence,'[]'::jsonb),
    COALESCE(_confidence, 0.5), COALESCE(_source,'engine'), _source_engine, _new_version, true
  ) RETURNING id INTO _new_id;

  IF FOUND OR _prev.id IS NOT NULL THEN
    UPDATE public.gbd_facts SET superseded_by = _new_id WHERE id = _prev.id;
  END IF;

  INSERT INTO public.gbd_fact_history (
    fact_id, module_key, topic, fact_key, prev_value, new_value,
    prev_confidence, new_confidence, change_reason, changed_by_engine
  ) VALUES (
    _new_id, _module_key, _topic, _fact_key, _prev.value, _value,
    _prev.confidence, _confidence, _change_reason, _source_engine
  );

  RETURN _new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gbd_upsert_fact(TEXT,TEXT,TEXT,JSONB,NUMERIC,TEXT,TEXT,TEXT,JSONB,TEXT) TO service_role;

-- Lightweight search over current facts.
CREATE OR REPLACE FUNCTION public.gbd_search_knowledge(_query TEXT, _limit INT DEFAULT 25)
RETURNS TABLE (module_key TEXT, topic TEXT, fact_key TEXT, value JSONB, confidence NUMERIC, version INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT module_key, topic, fact_key, value, confidence, version
  FROM public.gbd_facts
  WHERE is_current
    AND (
      topic ILIKE '%'||_query||'%'
      OR fact_key ILIKE '%'||_query||'%'
      OR value::text ILIKE '%'||_query||'%'
      OR _query = ANY (tags)
    )
  ORDER BY confidence DESC, updated_at DESC
  LIMIT GREATEST(_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.gbd_search_knowledge(TEXT, INT) TO authenticated, service_role;

-- Register the 10 canonical Business DNA modules.
INSERT INTO public.gbd_modules (key, name, category, description) VALUES
  ('identity',   'Business Identity DNA',  'core',        'Mission, vision, values, competitive advantages, target markets, expansion strategy.'),
  ('product',    'Product DNA',            'commercial',  'Categories, attributes, use cases, seasonality, pain points, ideal customers.'),
  ('customer',   'Customer DNA',           'commercial',  'Owner archetypes, LTV segments, gift/impulse buyers, behavior patterns.'),
  ('pricing',    'Pricing DNA',            'commercial',  'Margins, price psychology, charm pricing, discount policy, bundle rules, profit protection.'),
  ('shipping',   'Shipping DNA',           'operations',  'US shipping strategy, delivery promises, inventory rules, supplier confidence, stock quality.'),
  ('brand',      'Brand DNA',              'brand',       'Tone of voice, colors, photography, trust signals, visual identity, vocabulary.'),
  ('marketing',  'Marketing DNA',          'growth',      'Core messaging, emotional triggers, USPs, CTAs, offer strategy.'),
  ('psychology', 'Psychology DNA',         'growth',      'Curiosity, loss aversion, authority, social proof, belonging, status, safety, convenience, joy, relief, urgency.'),
  ('competitive','Competitive DNA',        'intel',       'Competitor monitoring, strengths, weaknesses, price gaps, creative trends, emerging opportunities.'),
  ('knowledge',  'Knowledge DNA',          'meta',        'Continuously collected internal learnings, analytics, creative wins/failures, customer & supplier behavior, performance history.')
ON CONFLICT (key) DO NOTHING;
