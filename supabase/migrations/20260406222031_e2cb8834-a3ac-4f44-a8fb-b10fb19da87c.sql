
-- Add retries column to existing pinterest_pin_queue
ALTER TABLE public.pinterest_pin_queue
ADD COLUMN IF NOT EXISTS retries integer NOT NULL DEFAULT 0;

-- Create post logs table
CREATE TABLE IF NOT EXISTS public.pinterest_post_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id uuid REFERENCES public.pinterest_pin_queue(id) ON DELETE SET NULL,
  action text NOT NULL,
  status text NOT NULL,
  error_message text,
  response_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pinterest_post_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can view post logs"
ON public.pinterest_post_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert logs (from edge functions)
CREATE POLICY "Service role can insert post logs"
ON public.pinterest_post_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_pinterest_post_logs_pin_queue_id ON public.pinterest_post_logs(pin_queue_id);
CREATE INDEX idx_pinterest_post_logs_created_at ON public.pinterest_post_logs(created_at DESC);
