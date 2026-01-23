-- Create table for variant fix logs
CREATE TABLE public.variant_fix_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  products_fixed INTEGER NOT NULL DEFAULT 0,
  total_variants_fixed INTEGER NOT NULL DEFAULT 0,
  fixed_products JSONB DEFAULT '[]'::jsonb,
  triggered_by TEXT DEFAULT 'cron',
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.variant_fix_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view logs
CREATE POLICY "Admins can view variant fix logs"
ON public.variant_fix_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for faster queries
CREATE INDEX idx_variant_fix_logs_created_at ON public.variant_fix_logs(created_at DESC);