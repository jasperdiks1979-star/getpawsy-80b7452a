
-- Singleton settings row
CREATE TABLE public.pinterest_autopilot_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'balanced' CHECK (mode IN ('conservative','balanced','aggressive')),
  max_pins_per_product_per_week INTEGER NOT NULL DEFAULT 3,
  preferred_category TEXT,
  min_quality_score INTEGER NOT NULL DEFAULT 70,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT pinterest_autopilot_settings_singleton CHECK (id = 1)
);
ALTER TABLE public.pinterest_autopilot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage autopilot settings" ON public.pinterest_autopilot_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.pinterest_autopilot_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Per-product overrides
CREATE TABLE public.pinterest_autopilot_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK (action IN ('exclude','force_promote','paused')),
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
ALTER TABLE public.pinterest_autopilot_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage autopilot overrides" ON public.pinterest_autopilot_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_autopilot_overrides_product ON public.pinterest_autopilot_overrides(product_id);

-- Decisions log (every Auto-Pilot evaluation)
CREATE TABLE public.pinterest_autopilot_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  product_slug TEXT,
  product_name TEXT,
  product_category TEXT,
  total_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_hook_category TEXT,
  selected_board_id TEXT,
  selected_board_name TEXT,
  expected_fit NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'selected' CHECK (status IN ('selected','skipped','queued','drafted','published','paused','scaled')),
  action TEXT NOT NULL DEFAULT 'normal' CHECK (action IN ('normal','scale','pause','skip')),
  reason TEXT,
  pin_queue_id UUID,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pinterest_autopilot_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage autopilot decisions" ON public.pinterest_autopilot_decisions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_autopilot_decisions_created ON public.pinterest_autopilot_decisions(created_at DESC);
CREATE INDEX idx_autopilot_decisions_product ON public.pinterest_autopilot_decisions(product_id, created_at DESC);
CREATE INDEX idx_autopilot_decisions_run ON public.pinterest_autopilot_decisions(run_id);
