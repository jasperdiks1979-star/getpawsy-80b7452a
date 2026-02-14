
-- Marketing jobs queue for async processing
CREATE TABLE public.marketing_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','success','failed','dead')),
  attempts INT NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Marketing observability events
CREATE TABLE public.marketing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for job worker performance
CREATE INDEX idx_marketing_jobs_due ON public.marketing_jobs (next_run_at) WHERE status IN ('queued','failed');
CREATE INDEX idx_marketing_events_provider ON public.marketing_events (provider, created_at DESC);

-- Auto-update updated_at on marketing_jobs
CREATE TRIGGER update_marketing_jobs_updated_at
  BEFORE UPDATE ON public.marketing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: admin-only access
ALTER TABLE public.marketing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access for marketing_jobs"
  ON public.marketing_jobs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin access for marketing_events"
  ON public.marketing_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow edge functions (service role) to insert events without auth
CREATE POLICY "Service insert marketing_events"
  ON public.marketing_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service manage marketing_jobs"
  ON public.marketing_jobs FOR ALL
  USING (true);
