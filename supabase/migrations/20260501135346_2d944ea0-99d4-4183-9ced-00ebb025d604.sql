ALTER TABLE public.monitoring_runs
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS watches_total INTEGER,
  ADD COLUMN IF NOT EXISTS watches_unhealthy INTEGER,
  ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_monitoring_runs_status ON public.monitoring_runs (status, started_at DESC);