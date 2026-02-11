
-- GSC Sync Runs table for observability + concurrency lock
CREATE TABLE public.gsc_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  reason TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'cron'
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'no_data' | 'error'
  days INTEGER DEFAULT 90,
  guide_count INTEGER DEFAULT 0,
  rows_upserted INTEGER DEFAULT 0,
  pages_with_data INTEGER DEFAULT 0,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_raw_rows INTEGER DEFAULT 0,
  unmatched_rows INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gsc_sync_runs ENABLE ROW LEVEL SECURITY;

-- Admin-only read policy
CREATE POLICY "Admins can view sync runs"
  ON public.gsc_sync_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert/update (edge functions use service role)
CREATE POLICY "Service role can manage sync runs"
  ON public.gsc_sync_runs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for quick "is another sync running?" check
CREATE INDEX idx_gsc_sync_runs_status ON public.gsc_sync_runs (status) WHERE status = 'running';
CREATE INDEX idx_gsc_sync_runs_started ON public.gsc_sync_runs (started_at DESC);

-- GSC auto-sync settings table
CREATE TABLE public.gsc_sync_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  sync_hour INTEGER NOT NULL DEFAULT 3,
  sync_minute INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.gsc_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync settings"
  ON public.gsc_sync_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.gsc_sync_settings (id, auto_sync_enabled) VALUES ('default', true);
