-- Organic Intelligence Engine (OIE) — reasoning layer over existing systems
-- Graph nodes/edges, root-cause analyses, success/failure DNA, patterns, explanations, scores

CREATE TABLE IF NOT EXISTS public.oie_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,           -- product|pin|board|category|collection|keyword|creative_style|visual_dna|headline|hook|description|cta|landing_page|price|discount|review|inventory|trend|competitor|visitor|session|order|repeat_purchase|seasonality
  node_key text NOT NULL,            -- canonical identifier (slug, pin id, kw, etc.)
  label text,
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, node_key)
);
GRANT SELECT ON public.oie_graph_nodes TO authenticated;
GRANT ALL ON public.oie_graph_nodes TO service_role;
ALTER TABLE public.oie_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_nodes admin read" ON public.oie_graph_nodes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_id uuid NOT NULL REFERENCES public.oie_graph_nodes(id) ON DELETE CASCADE,
  dst_id uuid NOT NULL REFERENCES public.oie_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,            -- influences|caused|published_on|targets|converted_via|contains|fatigues|aligns_with|competes_with
  weight numeric NOT NULL DEFAULT 1,
  evidence_count int NOT NULL DEFAULT 1,
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src_id, dst_id, relation)
);
CREATE INDEX IF NOT EXISTS oie_edges_src ON public.oie_graph_edges(src_id);
CREATE INDEX IF NOT EXISTS oie_edges_dst ON public.oie_graph_edges(dst_id);
GRANT SELECT ON public.oie_graph_edges TO authenticated;
GRANT ALL ON public.oie_graph_edges TO service_role;
ALTER TABLE public.oie_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_edges admin read" ON public.oie_graph_edges FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_root_cause_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,          -- revenue_drop|ctr_spike|saves_drop|conversion_lift|...
  entity_type text NOT NULL,         -- product|pin|board|category|global
  entity_key text,
  observed_change jsonb NOT NULL,    -- {metric, delta, period}
  causal_chain jsonb NOT NULL,       -- [{step, why, evidence, confidence}]
  root_cause text NOT NULL,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  evidence_strength numeric NOT NULL DEFAULT 0,
  reasoning_quality numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oie_root_cause_analyses TO authenticated;
GRANT ALL ON public.oie_root_cause_analyses TO service_role;
ALTER TABLE public.oie_root_cause_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_rca admin read" ON public.oie_root_cause_analyses FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_dna_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('success','failure')),
  scope text NOT NULL,               -- product|pin|campaign|category
  scope_key text,
  traits jsonb NOT NULL,             -- {visual_style, palette, headline_structure, hook, price_band, ...}
  sample_size int NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oie_dna_profiles TO authenticated;
GRANT ALL ON public.oie_dna_profiles TO service_role;
ALTER TABLE public.oie_dna_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_dna admin read" ON public.oie_dna_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key text UNIQUE NOT NULL,
  hypothesis text NOT NULL,
  evidence jsonb NOT NULL,
  lift numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  sample_size int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'discovered', -- discovered|validated|rejected|retired
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oie_patterns TO authenticated;
GRANT ALL ON public.oie_patterns TO service_role;
ALTER TABLE public.oie_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_patterns admin read" ON public.oie_patterns FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,        -- product|pin|recommendation|decision|metric
  subject_key text NOT NULL,
  question text NOT NULL,            -- why_selling|why_not_selling|whats_changing|...
  answer_md text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradicting jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  reasoning_quality numeric NOT NULL DEFAULT 0,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oie_expl_subject ON public.oie_explanations(subject_type, subject_key, created_at DESC);
GRANT SELECT ON public.oie_explanations TO authenticated;
GRANT ALL ON public.oie_explanations TO service_role;
ALTER TABLE public.oie_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_expl admin read" ON public.oie_explanations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_intelligence_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  organic_intelligence numeric NOT NULL DEFAULT 0,
  explanation_confidence numeric NOT NULL DEFAULT 0,
  prediction_confidence numeric NOT NULL DEFAULT 0,
  learning_stability numeric NOT NULL DEFAULT 0,
  reasoning_quality numeric NOT NULL DEFAULT 0,
  evidence_count int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_key)
);
GRANT SELECT ON public.oie_intelligence_scores TO authenticated;
GRANT ALL ON public.oie_intelligence_scores TO service_role;
ALTER TABLE public.oie_intelligence_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_scores admin read" ON public.oie_intelligence_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.oie_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                -- full|rca|dna|patterns|explain|score
  status text NOT NULL DEFAULT 'running',
  steps_completed int NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oie_runs TO authenticated;
GRANT ALL ON public.oie_runs TO service_role;
ALTER TABLE public.oie_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oie_runs admin read" ON public.oie_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
