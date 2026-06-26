
-- =========================
-- PMIN Wave X1 Foundation
-- =========================

-- 1. pmin_settings (singleton)
CREATE TABLE public.pmin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_enabled boolean NOT NULL DEFAULT false,
  kill_switch boolean NOT NULL DEFAULT false,
  daily_ai_budget_usd numeric NOT NULL DEFAULT 30,
  per_run_vision_budget_usd numeric NOT NULL DEFAULT 5,
  max_queries_per_run int NOT NULL DEFAULT 25,
  max_candidates_per_query int NOT NULL DEFAULT 20,
  max_inserts_per_run int NOT NULL DEFAULT 500,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pmin_settings TO authenticated;
GRANT ALL ON public.pmin_settings TO service_role;
ALTER TABLE public.pmin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_settings admin read"
  ON public.pmin_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pmin_settings (brain_enabled, kill_switch, notes)
VALUES (false, false, 'PMIN Wave X1 seed — locks ON, discovery only.');

-- 2. pmin_sources
CREATE TABLE public.pmin_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN (
    'trends','search_suggest','related_search','category','seasonal',
    'shopping','board','keyword_seed','visual_search'
  )),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pmin_sources TO authenticated;
GRANT ALL ON public.pmin_sources TO service_role;
ALTER TABLE public.pmin_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_sources admin read"
  ON public.pmin_sources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pmin_sources (source_key, kind, config) VALUES
  ('pinterest_search_cats',     'search_suggest', '{"seed":"cat"}'),
  ('pinterest_search_dogs',     'search_suggest', '{"seed":"dog"}'),
  ('pinterest_search_pets',     'search_suggest', '{"seed":"pet"}'),
  ('pinterest_trends_seasonal', 'seasonal',       '{"region":"US"}'),
  ('pinterest_category_cattree','category',       '{"category":"cat tree"}'),
  ('pinterest_category_dogbed', 'category',       '{"category":"dog bed"}'),
  ('pinterest_category_litter', 'category',       '{"category":"litter box"}'),
  ('pinterest_category_toys',   'category',       '{"category":"pet toys"}');

-- 3. pmin_runs
CREATE TABLE public.pmin_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  mode text NOT NULL DEFAULT 'live' CHECK (mode IN ('dry_run','live')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','error')),
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text
);
GRANT SELECT ON public.pmin_runs TO authenticated;
GRANT ALL ON public.pmin_runs TO service_role;
ALTER TABLE public.pmin_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_runs admin read"
  ON public.pmin_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. pmin_run_steps
CREATE TABLE public.pmin_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pmin_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON public.pmin_run_steps(run_id);
GRANT SELECT ON public.pmin_run_steps TO authenticated;
GRANT ALL ON public.pmin_run_steps TO service_role;
ALTER TABLE public.pmin_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_run_steps admin read"
  ON public.pmin_run_steps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. pmin_discovered_pins (metadata only)
CREATE TABLE public.pmin_discovered_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  title_hash text NOT NULL,
  title_sample text,         -- max 200 chars (enforced in code)
  description_sample text,   -- max 200 chars
  category_key text,
  niche_key text,
  region text DEFAULT 'US',
  engagement_proxy numeric,
  freshness_days int,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, title_hash)
);
CREATE INDEX ON public.pmin_discovered_pins(category_key);
CREATE INDEX ON public.pmin_discovered_pins(niche_key);
CREATE INDEX ON public.pmin_discovered_pins(discovered_at DESC);
GRANT SELECT ON public.pmin_discovered_pins TO authenticated;
GRANT ALL ON public.pmin_discovered_pins TO service_role;
ALTER TABLE public.pmin_discovered_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_discovered_pins admin read"
  ON public.pmin_discovered_pins FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. pmin_keyword_trends
CREATE TABLE public.pmin_keyword_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  category_key text,
  week_start date NOT NULL,
  volume_proxy numeric NOT NULL DEFAULT 0,
  velocity numeric NOT NULL DEFAULT 0,
  season_flag text,
  opportunity_score numeric NOT NULL DEFAULT 0,
  sample_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword, category_key, week_start)
);
CREATE INDEX ON public.pmin_keyword_trends(opportunity_score DESC);
GRANT SELECT ON public.pmin_keyword_trends TO authenticated;
GRANT ALL ON public.pmin_keyword_trends TO service_role;
ALTER TABLE public.pmin_keyword_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_keyword_trends admin read"
  ON public.pmin_keyword_trends FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 7. pmin_category_knowledge
CREATE TABLE public.pmin_category_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL UNIQUE,
  best_colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_hooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_lengths jsonb NOT NULL DEFAULT '{}'::jsonb,
  best_posting_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_ctas jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pmin_category_knowledge TO authenticated;
GRANT ALL ON public.pmin_category_knowledge TO service_role;
ALTER TABLE public.pmin_category_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmin_category_knowledge admin read"
  ON public.pmin_category_knowledge FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger reuse
CREATE TRIGGER pmin_settings_updated_at
  BEFORE UPDATE ON public.pmin_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pmin_sources_updated_at
  BEFORE UPDATE ON public.pmin_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
