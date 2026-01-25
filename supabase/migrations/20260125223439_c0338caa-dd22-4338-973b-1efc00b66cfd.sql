-- Create table for cron job execution logs
CREATE TABLE public.cron_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'running',
  success boolean,
  items_processed integer DEFAULT 0,
  items_failed integer DEFAULT 0,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view logs
CREATE POLICY "Admins can view cron logs"
ON public.cron_job_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage logs
CREATE POLICY "Service role can manage cron logs"
ON public.cron_job_logs
FOR ALL
USING (auth.role() = 'service_role'::text);

-- Create index for faster queries
CREATE INDEX idx_cron_job_logs_job_name ON public.cron_job_logs(job_name);
CREATE INDEX idx_cron_job_logs_started_at ON public.cron_job_logs(started_at DESC);

-- Add comment
COMMENT ON TABLE public.cron_job_logs IS 'Stores execution logs for scheduled cron jobs';