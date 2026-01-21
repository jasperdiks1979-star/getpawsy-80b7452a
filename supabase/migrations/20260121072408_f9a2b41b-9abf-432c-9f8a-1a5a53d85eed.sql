-- Create stock notifications table
CREATE TABLE public.stock_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate signups
CREATE UNIQUE INDEX stock_notifications_product_email_idx ON public.stock_notifications(product_id, email);

-- Create index for efficient querying
CREATE INDEX stock_notifications_product_id_idx ON public.stock_notifications(product_id);
CREATE INDEX stock_notifications_notified_idx ON public.stock_notifications(notified_at) WHERE notified_at IS NULL;

-- Enable RLS
ALTER TABLE public.stock_notifications ENABLE ROW LEVEL SECURITY;

-- Anyone can sign up for stock notifications
CREATE POLICY "Anyone can sign up for stock notifications"
  ON public.stock_notifications
  FOR INSERT
  WITH CHECK (true);

-- Admins can view all stock notifications
CREATE POLICY "Admins can view stock notifications"
  ON public.stock_notifications
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage stock notifications (for edge function)
CREATE POLICY "Service role can manage stock notifications"
  ON public.stock_notifications
  FOR ALL
  USING (auth.role() = 'service_role'::text);