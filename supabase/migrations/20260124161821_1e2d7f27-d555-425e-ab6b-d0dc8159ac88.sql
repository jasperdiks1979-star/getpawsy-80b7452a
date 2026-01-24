-- Create table for frontend error logs
CREATE TABLE public.frontend_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  component_name TEXT,
  stack_trace TEXT,
  page_url TEXT,
  user_agent TEXT,
  session_id TEXT,
  user_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.frontend_error_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert errors (for anonymous error reporting)
CREATE POLICY "Anyone can insert error logs"
ON public.frontend_error_logs
FOR INSERT
WITH CHECK (true);

-- Only admins can view error logs
CREATE POLICY "Admins can view error logs"
ON public.frontend_error_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add index for faster querying
CREATE INDEX idx_frontend_error_logs_created_at ON public.frontend_error_logs(created_at DESC);
CREATE INDEX idx_frontend_error_logs_error_type ON public.frontend_error_logs(error_type);

-- Add comment
COMMENT ON TABLE public.frontend_error_logs IS 'Stores frontend errors including React #310 for debugging';