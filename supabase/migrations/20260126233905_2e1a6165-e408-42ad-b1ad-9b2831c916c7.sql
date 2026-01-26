-- Create table to store daily GA4 snapshots
CREATE TABLE IF NOT EXISTS public.ga4_daily_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  active_users INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  avg_session_duration NUMERIC DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  top_pages JSONB DEFAULT '[]'::jsonb,
  devices JSONB DEFAULT '[]'::jsonb,
  countries JSONB DEFAULT '[]'::jsonb,
  traffic_sources JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index on report_date for faster lookups
CREATE INDEX IF NOT EXISTS idx_ga4_daily_snapshots_report_date ON public.ga4_daily_snapshots(report_date DESC);

-- Enable RLS
ALTER TABLE public.ga4_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Only admins can view GA4 data
CREATE POLICY "Admins can view GA4 snapshots" 
ON public.ga4_daily_snapshots 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage GA4 data (for cron job)
CREATE POLICY "Service role can manage GA4 snapshots" 
ON public.ga4_daily_snapshots 
FOR ALL 
USING (auth.role() = 'service_role'::text);

-- Add comment for documentation
COMMENT ON TABLE public.ga4_daily_snapshots IS 'Daily snapshots of GA4 analytics data synced by the daily-ga4-sync cron job';