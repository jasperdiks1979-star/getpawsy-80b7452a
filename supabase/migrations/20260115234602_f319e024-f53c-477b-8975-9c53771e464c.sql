-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  customer_email TEXT,
  shipping_address JSONB,
  items JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id OR customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update orders
CREATE POLICY "Admins can update orders"
ON public.orders
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert/update orders (for webhooks)
CREATE POLICY "Service role can manage orders"
ON public.orders
FOR ALL
USING (auth.role() = 'service_role');

-- Allow insert for authenticated users creating their own orders
CREATE POLICY "Users can create their own orders"
ON public.orders
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();