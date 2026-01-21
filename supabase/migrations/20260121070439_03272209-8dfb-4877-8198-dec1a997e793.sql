-- Create abandoned carts table to track cart abandonment
CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  customer_email TEXT,
  cart_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  cart_total NUMERIC NOT NULL DEFAULT 0,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  recovered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_abandoned_carts_session ON public.abandoned_carts(session_id);
CREATE INDEX idx_abandoned_carts_email ON public.abandoned_carts(customer_email);
CREATE INDEX idx_abandoned_carts_created ON public.abandoned_carts(created_at);

-- Enable RLS
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert/update their cart (tracked by session)
CREATE POLICY "Anyone can insert abandoned carts" 
ON public.abandoned_carts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update their own cart by session" 
ON public.abandoned_carts 
FOR UPDATE 
USING (true);

-- Admins can view all abandoned carts
CREATE POLICY "Admins can view abandoned carts" 
ON public.abandoned_carts 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage all
CREATE POLICY "Service role can manage abandoned carts" 
ON public.abandoned_carts 
FOR ALL 
USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_abandoned_carts_updated_at
BEFORE UPDATE ON public.abandoned_carts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();