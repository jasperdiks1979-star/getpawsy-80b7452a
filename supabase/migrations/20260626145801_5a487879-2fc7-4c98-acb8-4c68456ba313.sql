
CREATE TABLE IF NOT EXISTS public.pinterest_recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  verdict TEXT,
  phase JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  publish_allowed BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_recovery_runs TO authenticated;
GRANT ALL ON public.pinterest_recovery_runs TO service_role;
ALTER TABLE public.pinterest_recovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recovery_runs_admin_read" ON public.pinterest_recovery_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.pinterest_recovery_pin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pinterest_recovery_runs(id) ON DELETE CASCADE,
  pin_id TEXT,
  product_id UUID,
  product_slug TEXT,
  title TEXT,
  description TEXT,
  board TEXT,
  classification TEXT NOT NULL,
  quality_score NUMERIC,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_recovery_pin_audit TO authenticated;
GRANT ALL ON public.pinterest_recovery_pin_audit TO service_role;
ALTER TABLE public.pinterest_recovery_pin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recovery_pin_audit_admin_read" ON public.pinterest_recovery_pin_audit FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_recovery_pin_audit_run ON public.pinterest_recovery_pin_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_recovery_pin_audit_class ON public.pinterest_recovery_pin_audit(classification);

CREATE TABLE IF NOT EXISTS public.pinterest_recovery_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pinterest_recovery_runs(id) ON DELETE CASCADE,
  trust_score NUMERIC NOT NULL,
  publisher_quality NUMERIC NOT NULL,
  creative_diversity NUMERIC NOT NULL,
  board_diversity NUMERIC NOT NULL,
  topic_diversity NUMERIC NOT NULL,
  freshness NUMERIC NOT NULL,
  seo_score NUMERIC NOT NULL,
  conversion_score NUMERIC NOT NULL,
  account_health NUMERIC NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_recovery_trust_scores TO authenticated;
GRANT ALL ON public.pinterest_recovery_trust_scores TO service_role;
ALTER TABLE public.pinterest_recovery_trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recovery_trust_admin_read" ON public.pinterest_recovery_trust_scores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.pinterest_recovery_ramp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week INT NOT NULL UNIQUE,
  max_pins_per_day INT NOT NULL,
  required_trust NUMERIC NOT NULL,
  required_health NUMERIC NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_recovery_ramp TO authenticated;
GRANT ALL ON public.pinterest_recovery_ramp TO service_role;
ALTER TABLE public.pinterest_recovery_ramp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recovery_ramp_admin_read" ON public.pinterest_recovery_ramp FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.pinterest_recovery_ramp (week, max_pins_per_day, required_trust, required_health, active, notes) VALUES
  (1, 3,  60, 75, true,  'Week 1 — premium only, 3 pins/day max'),
  (2, 5,  70, 80, false, 'Week 2 — unlock to 5/day if trust + impressions improving'),
  (3, 8,  80, 90, false, 'Week 3 — unlock to 8/day if 14-day impressions trend up'),
  (4, 12, 90, 95, false, 'Week 4 — full 12/day operational mode')
ON CONFLICT (week) DO NOTHING;
