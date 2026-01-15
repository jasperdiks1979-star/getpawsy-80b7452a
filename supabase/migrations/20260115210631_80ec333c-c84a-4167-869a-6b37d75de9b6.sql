-- Create table for blocked CJ products
CREATE TABLE public.blocked_cj_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cj_product_id text NOT NULL UNIQUE,
  product_name text,
  blocked_at timestamp with time zone NOT NULL DEFAULT now(),
  blocked_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.blocked_cj_products ENABLE ROW LEVEL SECURITY;

-- Only admins can view blocked products
CREATE POLICY "Admins can view blocked products"
  ON public.blocked_cj_products
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can block products
CREATE POLICY "Admins can block products"
  ON public.blocked_cj_products
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can unblock products
CREATE POLICY "Admins can unblock products"
  ON public.blocked_cj_products
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));