
-- 1. Per-attempt render log (every brief → render → quality decision)
CREATE TABLE IF NOT EXISTS public.pinterest_render_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id  UUID NULL REFERENCES public.pinterest_pin_queue(id) ON DELETE SET NULL,
  product_slug  TEXT NULL,
  niche_key     TEXT NULL,
  pattern_id    TEXT NULL,
  hook_category TEXT NULL,
  attempt_no    INT  NOT NULL DEFAULT 1,
  scores        JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score   NUMERIC(5,2) NULL,
  rejected      BOOLEAN NOT NULL DEFAULT false,
  reasons       TEXT[] NOT NULL DEFAULT '{}',
  brief         JSONB NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pra_created
  ON public.pinterest_render_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pra_pin
  ON public.pinterest_render_attempts (pin_queue_id);
ALTER TABLE public.pinterest_render_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage render attempts"
  ON public.pinterest_render_attempts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Per-pin composite winner score
CREATE TABLE IF NOT EXISTS public.pinterest_creative_winners (
  pin_queue_id            UUID PRIMARY KEY REFERENCES public.pinterest_pin_queue(id) ON DELETE CASCADE,
  pattern_id              TEXT NULL,
  hook_category           TEXT NULL,
  cta_phrase              TEXT NULL,
  niche_key               TEXT NULL,
  pinterest_impressions   INT NOT NULL DEFAULT 0,
  pinterest_saves         INT NOT NULL DEFAULT 0,
  pinterest_outbound_clicks INT NOT NULL DEFAULT 0,
  ga4_sessions            INT NOT NULL DEFAULT 0,
  ga4_engaged_sessions    INT NOT NULL DEFAULT 0,
  profit_verdict          TEXT NULL,
  composite_score         NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_recomputed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcw_pattern
  ON public.pinterest_creative_winners (pattern_id, hook_category);
CREATE INDEX IF NOT EXISTS idx_pcw_niche
  ON public.pinterest_creative_winners (niche_key, composite_score DESC);
ALTER TABLE public.pinterest_creative_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage creative winners"
  ON public.pinterest_creative_winners
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Aggregated pattern weights
CREATE TABLE IF NOT EXISTS public.pinterest_pattern_weights (
  pattern_id     TEXT NOT NULL,
  hook_category  TEXT NOT NULL,
  niche_key      TEXT NOT NULL,
  composite_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  sample_size    INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pattern_id, hook_category, niche_key)
);
CREATE INDEX IF NOT EXISTS idx_ppw_niche_score
  ON public.pinterest_pattern_weights (niche_key, composite_score DESC);
ALTER TABLE public.pinterest_pattern_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage pattern weights"
  ON public.pinterest_pattern_weights
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
