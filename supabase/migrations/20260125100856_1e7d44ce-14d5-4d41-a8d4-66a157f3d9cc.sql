-- Create table to log CJ webhook events
CREATE TABLE public.cj_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  webhook_type TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cj_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view webhook logs" 
  ON public.cj_webhook_logs 
  FOR SELECT 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage logs (for edge function)
CREATE POLICY "Service role can manage webhook logs" 
  ON public.cj_webhook_logs 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Create index for faster lookups
CREATE INDEX idx_cj_webhook_logs_message_id ON public.cj_webhook_logs(message_id);
CREATE INDEX idx_cj_webhook_logs_created_at ON public.cj_webhook_logs(created_at DESC);
CREATE INDEX idx_cj_webhook_logs_type ON public.cj_webhook_logs(webhook_type);

-- Add comment
COMMENT ON TABLE public.cj_webhook_logs IS 'Logs all incoming CJ Dropshipping webhook events for debugging and auditing';