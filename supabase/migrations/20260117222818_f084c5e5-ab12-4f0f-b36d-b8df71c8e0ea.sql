-- Create table to track notified loss-making products
CREATE TABLE public.loss_making_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  margin_percentage NUMERIC NOT NULL,
  total_loss NUMERIC NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loss_making_notifications ENABLE ROW LEVEL SECURITY;

-- Only service role and admins can access this table
CREATE POLICY "Service role can manage loss notifications"
ON public.loss_making_notifications
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Admins can view loss notifications"
ON public.loss_making_notifications
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster lookups
CREATE INDEX idx_loss_notifications_product_id ON public.loss_making_notifications(product_id);
CREATE INDEX idx_loss_notifications_notified_at ON public.loss_making_notifications(notified_at DESC);