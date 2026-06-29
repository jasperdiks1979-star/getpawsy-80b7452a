
CREATE TABLE IF NOT EXISTS public.cci_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  visitor_id text,
  event_name text NOT NULL,
  product_id text,
  variant_id text,
  source text,
  medium text,
  campaign text,
  landing_page text,
  page_path text,
  referrer text,
  device text,
  country text,
  funnel_stage text,
  confidence numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cci_events_session_idx ON public.cci_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cci_events_name_idx   ON public.cci_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS cci_events_product_idx ON public.cci_events(product_id, created_at DESC);

GRANT SELECT ON public.cci_events TO authenticated;
GRANT ALL ON public.cci_events TO service_role;
ALTER TABLE public.cci_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cci_events admin read" ON public.cci_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cci_events service all" ON public.cci_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.cci_repair_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  target text,
  before jsonb,
  after jsonb,
  applied_by text NOT NULL DEFAULT 'cci-auto',
  reversible boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cci_repair_log TO authenticated;
GRANT ALL ON public.cci_repair_log TO service_role;
ALTER TABLE public.cci_repair_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cci_repair_log admin read" ON public.cci_repair_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cci_repair_log service all" ON public.cci_repair_log FOR ALL TO service_role USING (true) WITH CHECK (true);
