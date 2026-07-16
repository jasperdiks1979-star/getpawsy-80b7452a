
-- 1. Run config (per-wave contract)
CREATE TABLE public.pinterest_run_config (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_slug TEXT,
  requested_pin_count INT NOT NULL DEFAULT 0,
  product_category TEXT,
  hero_priority_slugs TEXT[] DEFAULT ARRAY[]::TEXT[],
  max_credit_spend NUMERIC NOT NULL DEFAULT 10,
  max_image_calls INT NOT NULL DEFAULT 11,
  max_qa_calls INT NOT NULL DEFAULT 11,
  allow_pro_image BOOLEAN NOT NULL DEFAULT false,
  force_rescore BOOLEAN NOT NULL DEFAULT false,
  manual_resume_required BOOLEAN NOT NULL DEFAULT true,
  manual_resume BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','aborted','awaiting_manual_resume')),
  paused_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_run_config TO authenticated;
GRANT ALL ON public.pinterest_run_config TO service_role;
ALTER TABLE public.pinterest_run_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read run config" ON public.pinterest_run_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Cost ledger
CREATE TABLE public.pinterest_run_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pinterest_run_config(run_id) ON DELETE CASCADE,
  queue_id UUID,
  product_id UUID,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('image_gen','image_edit','qa','pre','integrity','native','composite','strategy','brief','probe')),
  retry_number INT NOT NULL DEFAULT 0,
  input_tokens INT,
  output_tokens INT,
  image_count INT DEFAULT 0,
  provider_cost_usd NUMERIC,
  credits NUMERIC NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_reason TEXT,
  image_hash TEXT,
  pdp_hero_hash TEXT,
  scoring_version TEXT,
  cached_hit BOOLEAN NOT NULL DEFAULT false,
  meta JSONB
);
CREATE INDEX pinterest_ledger_run_ts_idx ON public.pinterest_run_cost_ledger (run_id, ts DESC);
CREATE INDEX pinterest_ledger_queue_idx ON public.pinterest_run_cost_ledger (queue_id);
CREATE INDEX pinterest_ledger_hash_idx ON public.pinterest_run_cost_ledger (image_hash, pdp_hero_hash, scoring_version);
GRANT SELECT ON public.pinterest_run_cost_ledger TO authenticated;
GRANT ALL ON public.pinterest_run_cost_ledger TO service_role;
ALTER TABLE public.pinterest_run_cost_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read cost ledger" ON public.pinterest_run_cost_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. QA / PRE score cache
CREATE TABLE public.pinterest_qa_score_cache (
  cache_key TEXT PRIMARY KEY,
  scorer TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  image_hash TEXT NOT NULL,
  pdp_hero_hash TEXT,
  product_id UUID,
  result JSONB NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT false,
  credits_saved NUMERIC NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at TIMESTAMPTZ
);
CREATE INDEX pinterest_qa_cache_scorer_idx ON public.pinterest_qa_score_cache (scorer, scoring_version);
GRANT SELECT ON public.pinterest_qa_score_cache TO authenticated;
GRANT ALL ON public.pinterest_qa_score_cache TO service_role;
ALTER TABLE public.pinterest_qa_score_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read qa cache" ON public.pinterest_qa_score_cache
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. Extend queue for backlog isolation + hero priority
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS run_id UUID,
  ADD COLUMN IF NOT EXISTS hero_priority BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdp_hero_hash TEXT;
CREATE INDEX IF NOT EXISTS pinterest_pin_queue_run_idx ON public.pinterest_pin_queue (run_id);

-- 5. Extend render attempts
ALTER TABLE public.pinterest_render_attempts
  ADD COLUMN IF NOT EXISTS retry_number INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_model TEXT,
  ADD COLUMN IF NOT EXISTS image_hash TEXT,
  ADD COLUMN IF NOT EXISTS cost_credits NUMERIC,
  ADD COLUMN IF NOT EXISTS abort_reason TEXT,
  ADD COLUMN IF NOT EXISTS run_id UUID;

-- 6. Trigger for updated_at on run config
CREATE OR REPLACE FUNCTION public.pinterest_run_config_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER pinterest_run_config_touch_trg
  BEFORE UPDATE ON public.pinterest_run_config
  FOR EACH ROW EXECUTE FUNCTION public.pinterest_run_config_touch();
