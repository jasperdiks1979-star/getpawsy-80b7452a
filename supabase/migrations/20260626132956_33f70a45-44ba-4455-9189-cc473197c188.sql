
CREATE TABLE public.deploy_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('deploy_started','deploy_succeeded','deploy_failed','s3_put_failure')),
  status TEXT,
  object_key TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deploy_events_occurred_at_idx ON public.deploy_events (occurred_at DESC);
CREATE INDEX deploy_events_event_type_idx ON public.deploy_events (event_type);
GRANT SELECT, INSERT ON public.deploy_events TO authenticated;
GRANT ALL ON public.deploy_events TO service_role;
ALTER TABLE public.deploy_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read deploy events"
  ON public.deploy_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert deploy events"
  ON public.deploy_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access deploy events"
  ON public.deploy_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
