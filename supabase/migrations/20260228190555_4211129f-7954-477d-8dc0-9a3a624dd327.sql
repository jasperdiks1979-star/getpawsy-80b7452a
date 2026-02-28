
-- Sitemap ping log for circuit breaker, rate limiting, idempotency, and history
CREATE TABLE public.sitemap_ping_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engine TEXT NOT NULL, -- 'google' | 'bing'
  sitemap_url TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success' | 'timeout' | 'http_error' | 'circuit_open'
  http_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  run_id TEXT, -- optional link to job_runs
  reason TEXT, -- 'manual' | 'pipeline' | 'auto_deploy'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for rate limiting and circuit breaker queries
CREATE INDEX idx_sitemap_ping_log_created ON public.sitemap_ping_log (created_at DESC);
CREATE INDEX idx_sitemap_ping_log_engine ON public.sitemap_ping_log (engine, created_at DESC);

-- RLS
ALTER TABLE public.sitemap_ping_log ENABLE ROW LEVEL SECURITY;

-- Admin-only read access
CREATE POLICY "Admins can read sitemap ping logs"
  ON public.sitemap_ping_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts (from edge functions)
CREATE POLICY "Service role can insert sitemap ping logs"
  ON public.sitemap_ping_log FOR INSERT
  WITH CHECK (true);
