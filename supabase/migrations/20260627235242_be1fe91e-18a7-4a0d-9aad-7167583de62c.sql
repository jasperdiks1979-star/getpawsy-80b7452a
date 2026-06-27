
CREATE TABLE public.ode_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'running',
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ode_runs TO authenticated;
GRANT ALL ON public.ode_runs TO service_role;
ALTER TABLE public.ode_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_runs" ON public.ode_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_visual_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  characteristics JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_score NUMERIC NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  organic_lift NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ode_visual_dna TO authenticated;
GRANT ALL ON public.ode_visual_dna TO service_role;
ALTER TABLE public.ode_visual_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_visual_dna" ON public.ode_visual_dna FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_success_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  characteristic TEXT NOT NULL,
  pattern_value TEXT NOT NULL,
  category_key TEXT,
  evidence_score NUMERIC NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_engagement NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (characteristic, pattern_value, category_key)
);
GRANT SELECT ON public.ode_success_patterns TO authenticated;
GRANT ALL ON public.ode_success_patterns TO service_role;
ALTER TABLE public.ode_success_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_success_patterns" ON public.ode_success_patterns FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  characteristic TEXT NOT NULL,
  pattern_value TEXT NOT NULL,
  category_key TEXT,
  failure_score NUMERIC NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (characteristic, pattern_value, category_key)
);
GRANT SELECT ON public.ode_failure_patterns TO authenticated;
GRANT ALL ON public.ode_failure_patterns TO service_role;
ALTER TABLE public.ode_failure_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_failure_patterns" ON public.ode_failure_patterns FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_market_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL,
  keyword TEXT,
  demand_score NUMERIC NOT NULL DEFAULT 0,
  competition_score NUMERIC NOT NULL DEFAULT 0,
  trend_velocity NUMERIC NOT NULL DEFAULT 0,
  opportunity_score NUMERIC NOT NULL DEFAULT 0,
  recommended_dna TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ode_market_gaps TO authenticated;
GRANT ALL ON public.ode_market_gaps TO service_role;
ALTER TABLE public.ode_market_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_market_gaps" ON public.ode_market_gaps FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_pin_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_ref TEXT NOT NULL,
  product_id UUID,
  organic_confidence NUMERIC NOT NULL DEFAULT 0,
  success_dna_similarity NUMERIC NOT NULL DEFAULT 0,
  visual_dna_strength NUMERIC NOT NULL DEFAULT 0,
  market_opportunity NUMERIC NOT NULL DEFAULT 0,
  evidence_quality NUMERIC NOT NULL DEFAULT 0,
  historical_organic NUMERIC NOT NULL DEFAULT 0,
  failure_penalty NUMERIC NOT NULL DEFAULT 0,
  trend_alignment NUMERIC NOT NULL DEFAULT 0,
  quality_score NUMERIC NOT NULL DEFAULT 0,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ode_pin_quality_scores TO authenticated;
GRANT ALL ON public.ode_pin_quality_scores TO service_role;
ALTER TABLE public.ode_pin_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_pin_quality_scores" ON public.ode_pin_quality_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.ode_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  delta NUMERIC,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ode_evolution_log TO authenticated;
GRANT ALL ON public.ode_evolution_log TO service_role;
ALTER TABLE public.ode_evolution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_evolution_log" ON public.ode_evolution_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ode_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  why TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'organic_behaviour',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ode_recommendations TO authenticated;
GRANT ALL ON public.ode_recommendations TO service_role;
ALTER TABLE public.ode_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ode_recommendations" ON public.ode_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.ode_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_ode_visual_dna_upd BEFORE UPDATE ON public.ode_visual_dna FOR EACH ROW EXECUTE FUNCTION public.ode_touch_updated_at();
CREATE TRIGGER trg_ode_success_patterns_upd BEFORE UPDATE ON public.ode_success_patterns FOR EACH ROW EXECUTE FUNCTION public.ode_touch_updated_at();
CREATE TRIGGER trg_ode_failure_patterns_upd BEFORE UPDATE ON public.ode_failure_patterns FOR EACH ROW EXECUTE FUNCTION public.ode_touch_updated_at();
CREATE TRIGGER trg_ode_market_gaps_upd BEFORE UPDATE ON public.ode_market_gaps FOR EACH ROW EXECUTE FUNCTION public.ode_touch_updated_at();
CREATE TRIGGER trg_ode_recommendations_upd BEFORE UPDATE ON public.ode_recommendations FOR EACH ROW EXECUTE FUNCTION public.ode_touch_updated_at();

CREATE INDEX idx_ode_pin_quality_scores_product ON public.ode_pin_quality_scores(product_id);
CREATE INDEX idx_ode_pin_quality_scores_score ON public.ode_pin_quality_scores(quality_score DESC);
CREATE INDEX idx_ode_market_gaps_score ON public.ode_market_gaps(opportunity_score DESC);
CREATE INDEX idx_ode_recommendations_subject ON public.ode_recommendations(subject_type, subject_id);
