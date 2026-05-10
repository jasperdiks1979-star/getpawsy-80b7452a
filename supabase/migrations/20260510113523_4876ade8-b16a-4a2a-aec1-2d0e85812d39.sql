-- Pinterest Trend Signals
CREATE TABLE IF NOT EXISTS public.pinterest_trend_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_key TEXT NOT NULL,
  pin_mode TEXT,
  aesthetic_tone TEXT,
  trend_label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  weight NUMERIC NOT NULL DEFAULT 1.0,
  rationale TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pinterest_trend_signals_active
  ON public.pinterest_trend_signals (niche_key, is_active, weight DESC);
ALTER TABLE public.pinterest_trend_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage trend signals"
  ON public.pinterest_trend_signals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Pinterest Evolution Log
CREATE TABLE IF NOT EXISTS public.pinterest_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_type TEXT NOT NULL,
  niche_key TEXT,
  target_dimension TEXT,
  old_value JSONB,
  new_value JSONB,
  rationale TEXT,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pinterest_evolution_log_recent
  ON public.pinterest_evolution_log (created_at DESC);
ALTER TABLE public.pinterest_evolution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view evolution log"
  ON public.pinterest_evolution_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Pinterest Strategy State (live evolving config)
CREATE TABLE IF NOT EXISTS public.pinterest_strategy_state (
  id INT PRIMARY KEY DEFAULT 1,
  quality_threshold NUMERIC NOT NULL DEFAULT 80,
  exploit_ratio NUMERIC NOT NULL DEFAULT 0.8,
  archetype_boosts JSONB NOT NULL DEFAULT '{}'::jsonb,
  hook_boosts JSONB NOT NULL DEFAULT '{}'::jsonb,
  trend_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_evolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_strategy_state_singleton CHECK (id = 1)
);
INSERT INTO public.pinterest_strategy_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.pinterest_strategy_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view strategy state"
  ON public.pinterest_strategy_state FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));