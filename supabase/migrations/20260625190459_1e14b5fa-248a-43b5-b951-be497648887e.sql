
-- ============================================================
-- Wave 3A: Pinterest Creative Intelligence V2 — Foundation
-- ============================================================

-- 1. Product Intelligence (Step 1)
CREATE TABLE IF NOT EXISTS public.pin_product_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  species TEXT,
  category TEXT,
  emotional_trigger TEXT,
  buying_intent TEXT,
  lifestyle_context TEXT,
  seasonality TEXT,
  visual_style TEXT,
  audience TEXT,
  price_tier TEXT,
  usp_hierarchy JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinterest_board_id TEXT,
  landing_url TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  model_used TEXT,
  raw_response JSONB,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, version)
);
GRANT SELECT ON public.pin_product_intelligence TO authenticated;
GRANT ALL ON public.pin_product_intelligence TO service_role;
ALTER TABLE public.pin_product_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_product_intelligence"
ON public.pin_product_intelligence FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Landing Page Validations (Step 2)
CREATE TABLE IF NOT EXISTS public.pin_landing_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  landing_url TEXT NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT false,
  checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  failed_reasons TEXT[] NOT NULL DEFAULT '{}',
  http_status INT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_landing_validations_product ON public.pin_landing_validations(product_id, checked_at DESC);
GRANT SELECT ON public.pin_landing_validations TO authenticated;
GRANT ALL ON public.pin_landing_validations TO service_role;
ALTER TABLE public.pin_landing_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_landing_validations"
ON public.pin_landing_validations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Hook Library V2 (Step 4)
CREATE TABLE IF NOT EXISTS public.pin_hook_library_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket TEXT NOT NULL,
  hook_text TEXT NOT NULL UNIQUE,
  species_scope TEXT[] NOT NULL DEFAULT '{}',
  category_scope TEXT[] NOT NULL DEFAULT '{}',
  banned_for TEXT[] NOT NULL DEFAULT '{}',
  usage_count INT NOT NULL DEFAULT 0,
  win_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  retired BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_hook_library_v2_bucket ON public.pin_hook_library_v2(bucket) WHERE retired = false;
GRANT SELECT ON public.pin_hook_library_v2 TO authenticated;
GRANT ALL ON public.pin_hook_library_v2 TO service_role;
ALTER TABLE public.pin_hook_library_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_hook_library_v2"
ON public.pin_hook_library_v2 FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Headline Bank (Step 5)
CREATE TABLE IF NOT EXISTS public.pin_headline_bank (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  headline TEXT NOT NULL,
  headline_hash TEXT NOT NULL,
  bucket TEXT,
  banned_phrases_found TEXT[] NOT NULL DEFAULT '{}',
  used_count INT NOT NULL DEFAULT 0,
  performance_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, headline_hash)
);
CREATE INDEX IF NOT EXISTS idx_pin_headline_bank_product ON public.pin_headline_bank(product_id);
GRANT SELECT ON public.pin_headline_bank TO authenticated;
GRANT ALL ON public.pin_headline_bank TO service_role;
ALTER TABLE public.pin_headline_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_headline_bank"
ON public.pin_headline_bank FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Creative Scores (Steps 6 & 7)
CREATE TABLE IF NOT EXISTS public.pin_creative_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  attempt_id TEXT NOT NULL,
  image_url TEXT,
  headline TEXT,
  hook_id UUID,
  hook_text TEXT,
  visual_realism NUMERIC(5,2),
  product_match NUMERIC(5,2),
  landing_score NUMERIC(5,2),
  species_score NUMERIC(5,2),
  board_score NUMERIC(5,2),
  hook_score NUMERIC(5,2),
  ctr_prediction NUMERIC(5,2),
  conversion_prediction NUMERIC(5,2),
  overall NUMERIC(5,2),
  passed_gate BOOLEAN NOT NULL DEFAULT false,
  rejection_reasons TEXT[] NOT NULL DEFAULT '{}',
  scorer_model TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_creative_scores_product ON public.pin_creative_scores(product_id, created_at DESC);
GRANT SELECT ON public.pin_creative_scores TO authenticated;
GRANT ALL ON public.pin_creative_scores TO service_role;
ALTER TABLE public.pin_creative_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_creative_scores"
ON public.pin_creative_scores FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Golden Batch (Step 8)
CREATE TABLE IF NOT EXISTS public.pin_golden_batch (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL,
  product_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  winner_score_id UUID,
  image_url TEXT,
  headline TEXT,
  description TEXT,
  hook_text TEXT,
  hook_bucket TEXT,
  overall_score NUMERIC(5,2),
  ctr_prediction NUMERIC(5,2),
  conv_prediction NUMERIC(5,2),
  variants_generated INT NOT NULL DEFAULT 0,
  variants_passed INT NOT NULL DEFAULT 0,
  retries_used INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_golden_batch_run ON public.pin_golden_batch(run_id);
GRANT SELECT ON public.pin_golden_batch TO authenticated;
GRANT ALL ON public.pin_golden_batch TO service_role;
ALTER TABLE public.pin_golden_batch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_golden_batch"
ON public.pin_golden_batch FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 7. A/B Experiments (Step 9)
CREATE TABLE IF NOT EXISTS public.pin_ab_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pin_id TEXT,
  golden_batch_id UUID,
  product_id UUID NOT NULL,
  hook_bucket TEXT,
  hook_text TEXT,
  headline TEXT,
  scene_template TEXT,
  status TEXT NOT NULL DEFAULT 'live',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_ab_experiments_product ON public.pin_ab_experiments(product_id);
GRANT SELECT ON public.pin_ab_experiments TO authenticated;
GRANT ALL ON public.pin_ab_experiments TO service_role;
ALTER TABLE public.pin_ab_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_ab_experiments"
ON public.pin_ab_experiments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pin_ab_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  impressions INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  closeups INT NOT NULL DEFAULT 0,
  outbound_clicks INT NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4),
  conversions INT NOT NULL DEFAULT 0,
  revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_ab_outcomes_exp ON public.pin_ab_outcomes(experiment_id, window_end DESC);
GRANT SELECT ON public.pin_ab_outcomes TO authenticated;
GRANT ALL ON public.pin_ab_outcomes TO service_role;
ALTER TABLE public.pin_ab_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_ab_outcomes"
ON public.pin_ab_outcomes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 8. Orchestration: runs + steps + settings
CREATE TABLE IF NOT EXISTS public.pin_wave3_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wave TEXT NOT NULL, -- '3A' | '3B' | '3C' | '3D'
  status TEXT NOT NULL DEFAULT 'running',
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pin_wave3_runs TO authenticated;
GRANT ALL ON public.pin_wave3_runs TO service_role;
ALTER TABLE public.pin_wave3_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_wave3_runs"
ON public.pin_wave3_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pin_wave3_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pin_wave3_steps_run ON public.pin_wave3_steps(run_id);
GRANT SELECT ON public.pin_wave3_steps TO authenticated;
GRANT ALL ON public.pin_wave3_steps TO service_role;
ALTER TABLE public.pin_wave3_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_wave3_steps"
ON public.pin_wave3_steps FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pin_wave3_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pin_wave3_settings TO authenticated;
GRANT ALL ON public.pin_wave3_settings TO service_role;
ALTER TABLE public.pin_wave3_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pin_wave3_settings"
ON public.pin_wave3_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed defaults
INSERT INTO public.pin_wave3_settings (key, value) VALUES
  ('retry_cap', '5'::jsonb),
  ('golden_batch_size', '25'::jsonb),
  ('variants_per_product', '10'::jsonb),
  ('publishing_paused', 'true'::jsonb),
  ('gate_thresholds', '{"visual_realism":99,"product_match":99,"landing":100,"species":99,"board":99,"hook":99,"ctr":98,"conversion":98}'::jsonb)
ON CONFLICT (key) DO NOTHING;
