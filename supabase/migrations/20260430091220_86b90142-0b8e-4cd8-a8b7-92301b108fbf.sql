
-- Active CTA variant config (single row controls which variant /go serves).
-- Auto-rollback edge function flips active_variant when CTR drops below threshold.
CREATE TABLE IF NOT EXISTS public.cta_variant_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_variant TEXT NOT NULL DEFAULT 'high_conv_v3',
  baseline_variant TEXT NOT NULL DEFAULT 'high_conv_v2',
  ctr_floor_pct NUMERIC NOT NULL DEFAULT 6.0,
  evaluation_window_hours INTEGER NOT NULL DEFAULT 24,
  min_impressions INTEGER NOT NULL DEFAULT 200,
  rollback_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton row if missing.
INSERT INTO public.cta_variant_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Append-only rollback audit log.
CREATE TABLE IF NOT EXISTS public.cta_variant_rollback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_variant TEXT NOT NULL,
  to_variant TEXT NOT NULL,
  reason TEXT NOT NULL,
  ctr_pct NUMERIC,
  ctr_floor_pct NUMERIC,
  impressions INTEGER,
  clicks INTEGER,
  window_hours INTEGER,
  was_automatic BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cta_rollback_log_created ON public.cta_variant_rollback_log(created_at DESC);

ALTER TABLE public.cta_variant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_variant_rollback_log ENABLE ROW LEVEL SECURITY;

-- Public read: /go must fetch the active variant anonymously.
DROP POLICY IF EXISTS "Anyone can read CTA variant config" ON public.cta_variant_config;
CREATE POLICY "Anyone can read CTA variant config"
  ON public.cta_variant_config FOR SELECT
  USING (true);

-- Admin-only writes. Edge function uses service role so bypasses RLS.
DROP POLICY IF EXISTS "Admins can update CTA variant config" ON public.cta_variant_config;
CREATE POLICY "Admins can update CTA variant config"
  ON public.cta_variant_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rollback log: admin read, no client writes (service role only).
DROP POLICY IF EXISTS "Admins can read rollback log" ON public.cta_variant_rollback_log;
CREATE POLICY "Admins can read rollback log"
  ON public.cta_variant_rollback_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
