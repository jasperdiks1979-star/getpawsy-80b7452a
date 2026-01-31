-- Create table to track sync progress for resumable syncing
CREATE TABLE IF NOT EXISTS public.sync_progress (
  id TEXT PRIMARY KEY DEFAULT 'stock-sync',
  last_offset INTEGER DEFAULT 0,
  total_products INTEGER DEFAULT 0,
  synced_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  started_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_messages TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage sync progress" ON public.sync_progress
  FOR ALL 
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role bypass for cron jobs  
CREATE POLICY "Service role can manage sync progress" ON public.sync_progress
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');