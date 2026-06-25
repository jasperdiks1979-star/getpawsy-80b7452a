
CREATE TABLE public.pin_wave2_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  pin_id uuid NOT NULL REFERENCES public.pinterest_pin_queue(id) ON DELETE CASCADE,
  product_id uuid,
  confidence numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  mismatch_types text[] NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  replacement_pin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pin_wave2_audits_run ON public.pin_wave2_audits(run_id);
CREATE INDEX idx_pin_wave2_audits_pin ON public.pin_wave2_audits(pin_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_wave2_audits TO authenticated;
GRANT ALL ON public.pin_wave2_audits TO service_role;
ALTER TABLE public.pin_wave2_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wave2 audits" ON public.pin_wave2_audits FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.pin_wave2_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total_audited integer NOT NULL DEFAULT 0,
  total_passed integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  total_archived integer NOT NULL DEFAULT 0,
  total_replacements_queued integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_wave2_runs TO authenticated;
GRANT ALL ON public.pin_wave2_runs TO service_role;
ALTER TABLE public.pin_wave2_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wave2 runs" ON public.pin_wave2_runs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
