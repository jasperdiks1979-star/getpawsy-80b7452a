
-- Extend existing pinterest_competitor_pins (additive only)
ALTER TABLE public.pinterest_competitor_pins
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_slug text,
  ADD COLUMN IF NOT EXISTS query text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS title_hash text,
  ADD COLUMN IF NOT EXISTS title_sample text,
  ADD COLUMN IF NOT EXISTS description_sample text,
  ADD COLUMN IF NOT EXISTS board_name text,
  ADD COLUMN IF NOT EXISTS visual_type text,
  ADD COLUMN IF NOT EXISTS hook_angle text,
  ADD COLUMN IF NOT EXISTS benefit_angle text,
  ADD COLUMN IF NOT EXISTS cta_pattern text,
  ADD COLUMN IF NOT EXISTS detected_keywords text[],
  ADD COLUMN IF NOT EXISTS visible_saves integer,
  ADD COLUMN IF NOT EXISTS visible_comments integer,
  ADD COLUMN IF NOT EXISTS visible_engagement_score numeric,
  ADD COLUMN IF NOT EXISTS freshness_score numeric,
  ADD COLUMN IF NOT EXISTS relevance_score numeric,
  ADD COLUMN IF NOT EXISTS competitor_success_score numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS pinterest_competitor_pins_dedupe_idx
  ON public.pinterest_competitor_pins (product_id, title_hash, source_url)
  WHERE product_id IS NOT NULL AND title_hash IS NOT NULL AND source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS pinterest_competitor_pins_product_idx
  ON public.pinterest_competitor_pins (product_id, competitor_success_score DESC);

-- Patterns
CREATE TABLE IF NOT EXISTS public.pinterest_competitor_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,
  pattern_value text NOT NULL,
  niche_key text,
  sample_count integer NOT NULL DEFAULT 1,
  avg_success numeric NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_type, pattern_value, niche_key)
);
GRANT SELECT ON public.pinterest_competitor_patterns TO authenticated;
GRANT ALL ON public.pinterest_competitor_patterns TO service_role;
ALTER TABLE public.pinterest_competitor_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read competitor patterns"
  ON public.pinterest_competitor_patterns FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes competitor patterns"
  ON public.pinterest_competitor_patterns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Opportunities
CREATE TABLE IF NOT EXISTS public.pinterest_competitor_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_slug text,
  competitor_gap_score numeric NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  rank integer,
  generated_drafts integer NOT NULL DEFAULT 0,
  last_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
GRANT SELECT ON public.pinterest_competitor_opportunities TO authenticated;
GRANT ALL ON public.pinterest_competitor_opportunities TO service_role;
ALTER TABLE public.pinterest_competitor_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read competitor opportunities"
  ON public.pinterest_competitor_opportunities FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes competitor opportunities"
  ON public.pinterest_competitor_opportunities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS pinterest_competitor_opps_rank_idx
  ON public.pinterest_competitor_opportunities (rank ASC NULLS LAST);

-- Runs (audit)
CREATE TABLE IF NOT EXISTS public.pinterest_competitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  mode text NOT NULL DEFAULT 'live',
  products_scanned integer NOT NULL DEFAULT 0,
  competitor_candidates_found integer NOT NULL DEFAULT 0,
  patterns_extracted integer NOT NULL DEFAULT 0,
  opportunities_created integer NOT NULL DEFAULT 0,
  drafts_generated integer NOT NULL DEFAULT 0,
  queued integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);
GRANT SELECT ON public.pinterest_competitor_runs TO authenticated;
GRANT ALL ON public.pinterest_competitor_runs TO service_role;
ALTER TABLE public.pinterest_competitor_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read competitor runs"
  ON public.pinterest_competitor_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes competitor runs"
  ON public.pinterest_competitor_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS pinterest_competitor_runs_started_idx
  ON public.pinterest_competitor_runs (started_at DESC);
