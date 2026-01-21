-- Create remarketing_emails table to track sent upsell emails
CREATE TABLE public.remarketing_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  customer_email TEXT NOT NULL,
  email_type TEXT NOT NULL, -- 'day_14', 'day_21', 'day_30'
  product_upsold TEXT NOT NULL, -- product being promoted
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX idx_remarketing_emails_order_id ON public.remarketing_emails(order_id);
CREATE INDEX idx_remarketing_emails_customer_email ON public.remarketing_emails(customer_email);
CREATE INDEX idx_remarketing_emails_email_type ON public.remarketing_emails(email_type);
CREATE INDEX idx_remarketing_emails_sent_at ON public.remarketing_emails(sent_at);

-- Unique constraint to prevent duplicate emails
CREATE UNIQUE INDEX idx_remarketing_unique_email ON public.remarketing_emails(order_id, email_type);

-- Enable RLS
ALTER TABLE public.remarketing_emails ENABLE ROW LEVEL SECURITY;

-- Only admins can view remarketing emails
CREATE POLICY "Admins can view remarketing emails"
  ON public.remarketing_emails
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage remarketing emails
CREATE POLICY "Service role can manage remarketing emails"
  ON public.remarketing_emails
  FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Anyone can update for tracking (opens/clicks)
CREATE POLICY "Anyone can update tracking events"
  ON public.remarketing_emails
  FOR UPDATE
  USING (true);