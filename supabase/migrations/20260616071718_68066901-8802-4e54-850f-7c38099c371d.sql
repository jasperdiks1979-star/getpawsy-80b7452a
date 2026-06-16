CREATE TABLE public.render_worker_deploys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_source TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'render',
  commit_sha TEXT,
  commit_message TEXT,
  actor TEXT,
  http_status INTEGER,
  ok BOOLEAN NOT NULL DEFAULT false,
  response_body TEXT,
  error TEXT,
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX render_worker_deploys_triggered_at_idx
  ON public.render_worker_deploys (triggered_at DESC);

GRANT SELECT ON public.render_worker_deploys TO authenticated;
GRANT ALL ON public.render_worker_deploys TO service_role;

ALTER TABLE public.render_worker_deploys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read deploy log"
  ON public.render_worker_deploys
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages deploy log"
  ON public.render_worker_deploys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);