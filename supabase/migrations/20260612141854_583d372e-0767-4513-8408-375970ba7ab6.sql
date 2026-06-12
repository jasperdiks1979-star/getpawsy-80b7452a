
CREATE TABLE IF NOT EXISTS public.pinterest_protection_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  pins_audited INT NOT NULL DEFAULT 0,
  safe_to_remove_count INT NOT NULL DEFAULT 0,
  replace_first_count INT NOT NULL DEFAULT 0,
  keep_count INT NOT NULL DEFAULT 0,
  unknown_count INT NOT NULL DEFAULT 0,
  review_count INT NOT NULL DEFAULT 0,
  estimated_impressions_at_risk BIGINT NOT NULL DEFAULT 0,
  estimated_clicks_at_risk BIGINT NOT NULL DEFAULT 0,
  estimated_saves_at_risk BIGINT NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_protection_audit_runs TO authenticated;
GRANT ALL ON public.pinterest_protection_audit_runs TO service_role;

ALTER TABLE public.pinterest_protection_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage protection audit runs"
  ON public.pinterest_protection_audit_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pinterest_protection_audit_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.pinterest_protection_audit_runs(id) ON DELETE CASCADE,
  queue_id UUID,
  pinterest_pin_id TEXT,
  bucket TEXT NOT NULL,
  product_slug TEXT,
  board_name TEXT,
  destination_link TEXT,
  overlay_text TEXT,
  impressions INT NOT NULL DEFAULT 0,
  outbound_clicks INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  ctr NUMERIC,
  engagement_rate NUMERIC,
  age_days INT,
  has_analytics BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_protection_audit_pins TO authenticated;
GRANT ALL ON public.pinterest_protection_audit_pins TO service_role;

ALTER TABLE public.pinterest_protection_audit_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read protection audit pins"
  ON public.pinterest_protection_audit_pins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_protection_audit_pins_run ON public.pinterest_protection_audit_pins(run_id);
CREATE INDEX IF NOT EXISTS idx_protection_audit_pins_bucket ON public.pinterest_protection_audit_pins(run_id, bucket);
CREATE INDEX IF NOT EXISTS idx_protection_audit_runs_started ON public.pinterest_protection_audit_runs(started_at DESC);
