
-- 1) Config singleton
CREATE TABLE public.product_intelligence_config (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_mode BOOLEAN NOT NULL DEFAULT false,
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  nightly_scan_enabled BOOLEAN NOT NULL DEFAULT false,
  incremental_scan_enabled BOOLEAN NOT NULL DEFAULT false,
  immediate_new_product_scan BOOLEAN NOT NULL DEFAULT false,
  batch_size INT NOT NULL DEFAULT 25,
  max_products_per_run INT NOT NULL DEFAULT 50,
  estimated_credits_per_product NUMERIC NOT NULL DEFAULT 0.2,
  daily_credit_cap NUMERIC NOT NULL DEFAULT 200,
  intelligence_version INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_intelligence_config_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.product_intelligence_config TO authenticated;
GRANT ALL ON public.product_intelligence_config TO service_role;

ALTER TABLE public.product_intelligence_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read config" ON public.product_intelligence_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins write config" ON public.product_intelligence_config
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.product_intelligence_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2) Per-product intelligence
CREATE TABLE public.product_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE,
  intelligence_version INT NOT NULL DEFAULT 1,
  last_scanned_at TIMESTAMPTZ,
  scan_status TEXT NOT NULL DEFAULT 'pending',
  scan_error TEXT,

  -- Phase 2
  google_product_category TEXT,
  google_product_category_id INT,
  google_category_confidence NUMERIC,

  -- Phase 3
  pinterest_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_confidence NUMERIC,

  -- Phase 4
  primary_board TEXT,
  secondary_boards JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Phase 5/6/7
  seo_title TEXT,
  seo_description TEXT,
  pinterest_description TEXT,

  -- Phase 8
  primary_keyword TEXT,
  secondary_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  long_tail_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  keyword_score NUMERIC,

  -- Phase 9
  intent_type TEXT,
  intent_score NUMERIC,

  -- Phase 10
  opportunity_score NUMERIC,
  opportunity_tier TEXT,
  opportunity_factors JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Phase 11
  product_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  feed_optimization_status TEXT DEFAULT 'pending',
  feed_fixes JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_intelligence_status ON public.product_intelligence(scan_status);
CREATE INDEX idx_product_intelligence_opportunity ON public.product_intelligence(opportunity_score DESC NULLS LAST);
CREATE INDEX idx_product_intelligence_last_scanned ON public.product_intelligence(last_scanned_at NULLS FIRST);

GRANT SELECT ON public.product_intelligence TO authenticated;
GRANT ALL ON public.product_intelligence TO service_role;

ALTER TABLE public.product_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read intelligence" ON public.product_intelligence
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3) Runs / audit log
CREATE TABLE public.product_intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  mode TEXT NOT NULL DEFAULT 'incremental',
  status TEXT NOT NULL DEFAULT 'queued',
  products_targeted INT NOT NULL DEFAULT 0,
  products_scanned INT NOT NULL DEFAULT 0,
  products_failed INT NOT NULL DEFAULT 0,
  credits_used NUMERIC NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pi_runs_created ON public.product_intelligence_runs(created_at DESC);

GRANT SELECT ON public.product_intelligence_runs TO authenticated;
GRANT ALL ON public.product_intelligence_runs TO service_role;

ALTER TABLE public.product_intelligence_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read runs" ON public.product_intelligence_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER trg_pi_config_updated
  BEFORE UPDATE ON public.product_intelligence_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_pi_updated
  BEFORE UPDATE ON public.product_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
