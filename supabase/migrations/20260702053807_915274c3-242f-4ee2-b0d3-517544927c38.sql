
-- =====================================================================
-- GENESIS V15 — ENTERPRISE DIGITAL TWIN
-- Additive layer. Sources evidence from Ω.3 truth tables only.
-- =====================================================================

-- 1. Snapshots
CREATE TABLE public.genesis_v15_twin_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period TEXT NOT NULL DEFAULT 'live',
  revenue NUMERIC,
  orders INTEGER,
  visitors INTEGER,
  aov NUMERIC,
  conversion_rate NUMERIC,
  ai_spend NUMERIC,
  infra_spend NUMERIC,
  profit NUMERIC,
  cash NUMERIC,
  business_health_overall INTEGER,
  subscores JSONB NOT NULL DEFAULT '{}'::jsonb,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint_sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_twin_snapshots TO authenticated;
GRANT ALL ON public.genesis_v15_twin_snapshots TO service_role;
ALTER TABLE public.genesis_v15_twin_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 snapshots admin read" ON public.genesis_v15_twin_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_snapshots_captured ON public.genesis_v15_twin_snapshots(captured_at DESC);

-- 2. Entities (business graph nodes)
CREATE TABLE public.genesis_v15_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  label TEXT,
  domain TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  health_score INTEGER,
  last_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_key)
);
GRANT SELECT ON public.genesis_v15_entities TO authenticated;
GRANT ALL ON public.genesis_v15_entities TO service_role;
ALTER TABLE public.genesis_v15_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 entities admin read" ON public.genesis_v15_entities FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_entities_type ON public.genesis_v15_entities(entity_type);
CREATE INDEX idx_v15_entities_domain ON public.genesis_v15_entities(domain);

-- 3. Relationships (business graph edges)
CREATE TABLE public.genesis_v15_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.genesis_v15_entities(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.genesis_v15_entities(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight NUMERIC DEFAULT 1.0,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_relationships TO authenticated;
GRANT ALL ON public.genesis_v15_relationships TO service_role;
ALTER TABLE public.genesis_v15_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 rel admin read" ON public.genesis_v15_relationships FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_rel_source ON public.genesis_v15_relationships(source_id);
CREATE INDEX idx_v15_rel_target ON public.genesis_v15_relationships(target_id);

-- 4. Predictions
CREATE TABLE public.genesis_v15_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL,
  horizon TEXT NOT NULL,
  target_date DATE,
  predicted_value NUMERIC,
  ci_low NUMERIC,
  ci_high NUMERIC,
  confidence NUMERIC,
  assumptions JSONB DEFAULT '[]'::jsonb,
  model TEXT,
  actual_value NUMERIC,
  error_pct NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_predictions TO authenticated;
GRANT ALL ON public.genesis_v15_predictions TO service_role;
ALTER TABLE public.genesis_v15_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 preds admin read" ON public.genesis_v15_predictions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_preds_metric ON public.genesis_v15_predictions(metric, target_date DESC);

-- 5. Root Causes
CREATE TABLE public.genesis_v15_root_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi TEXT NOT NULL,
  change_direction TEXT,
  change_pct NUMERIC,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC,
  narrative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_root_causes TO authenticated;
GRANT ALL ON public.genesis_v15_root_causes TO service_role;
ALTER TABLE public.genesis_v15_root_causes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 rc admin read" ON public.genesis_v15_root_causes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_rc_kpi ON public.genesis_v15_root_causes(kpi, created_at DESC);

-- 6. Simulations
CREATE TABLE public.genesis_v15_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scenario TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  deltas JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted JSONB NOT NULL DEFAULT '{}'::jsonb,
  assumptions JSONB DEFAULT '[]'::jsonb,
  expected_revenue_delta NUMERIC,
  expected_profit_delta NUMERIC,
  expected_roi NUMERIC,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_simulations TO authenticated;
GRANT ALL ON public.genesis_v15_simulations TO service_role;
ALTER TABLE public.genesis_v15_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 sim admin read" ON public.genesis_v15_simulations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. Recommendations (Decision Engine)
CREATE TABLE public.genesis_v15_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem TEXT NOT NULL,
  root_cause TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  suggested_actions JSONB DEFAULT '[]'::jsonb,
  confidence NUMERIC,
  expected_impact TEXT,
  estimated_roi NUMERIC,
  estimated_effort TEXT,
  priority INTEGER,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_recommendations TO authenticated;
GRANT ALL ON public.genesis_v15_recommendations TO service_role;
ALTER TABLE public.genesis_v15_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 rec admin read" ON public.genesis_v15_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_rec_priority ON public.genesis_v15_recommendations(priority, created_at DESC);

-- 8. Bottlenecks
CREATE TABLE public.genesis_v15_bottlenecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  severity INTEGER,
  metric TEXT,
  metric_value NUMERIC,
  target_value NUMERIC,
  gap_pct NUMERIC,
  recommendation_id UUID REFERENCES public.genesis_v15_recommendations(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_bottlenecks TO authenticated;
GRANT ALL ON public.genesis_v15_bottlenecks TO service_role;
ALTER TABLE public.genesis_v15_bottlenecks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 bot admin read" ON public.genesis_v15_bottlenecks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_bot_domain ON public.genesis_v15_bottlenecks(domain, severity DESC);

-- 9. Memory (searchable business history)
CREATE TABLE public.genesis_v15_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  importance INTEGER DEFAULT 5,
  evidence JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  search_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_memory TO authenticated;
GRANT ALL ON public.genesis_v15_memory TO service_role;
ALTER TABLE public.genesis_v15_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 mem admin read" ON public.genesis_v15_memory FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_mem_event ON public.genesis_v15_memory(event_at DESC);
CREATE INDEX idx_v15_mem_search ON public.genesis_v15_memory USING gin(to_tsvector('simple', coalesce(search_text, title || ' ' || coalesce(body, ''))));

-- 10. Briefings
CREATE TABLE public.genesis_v15_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  period TEXT,
  role TEXT,
  markdown TEXT NOT NULL,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint_sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_briefings TO authenticated;
GRANT ALL ON public.genesis_v15_briefings TO service_role;
ALTER TABLE public.genesis_v15_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 brf admin read" ON public.genesis_v15_briefings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_brf_kind ON public.genesis_v15_briefings(kind, created_at DESC);

-- 11. Certifications
CREATE TABLE public.genesis_v15_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_intelligence_score INTEGER,
  prediction_accuracy INTEGER,
  business_health INTEGER,
  financial_health INTEGER,
  marketing_health INTEGER,
  infrastructure_health INTEGER,
  automation_health INTEGER,
  tax_readiness INTEGER,
  audit_readiness INTEGER,
  executive_readiness INTEGER,
  overall_genesis_intelligence INTEGER,
  narrative TEXT,
  subscores JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_v15_certifications TO authenticated;
GRANT ALL ON public.genesis_v15_certifications TO service_role;
ALTER TABLE public.genesis_v15_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v15 cert admin read" ON public.genesis_v15_certifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_v15_cert_issued ON public.genesis_v15_certifications(issued_at DESC);

-- update_updated_at trigger for entities and recommendations
CREATE OR REPLACE FUNCTION public.v15_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_v15_ent_updated BEFORE UPDATE ON public.genesis_v15_entities
FOR EACH ROW EXECUTE FUNCTION public.v15_touch_updated_at();
CREATE TRIGGER trg_v15_rec_updated BEFORE UPDATE ON public.genesis_v15_recommendations
FOR EACH ROW EXECUTE FUNCTION public.v15_touch_updated_at();
