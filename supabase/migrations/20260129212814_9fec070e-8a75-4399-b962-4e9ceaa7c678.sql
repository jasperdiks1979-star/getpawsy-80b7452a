-- Create table for discontinued products from suppliers
CREATE TABLE public.discontinued_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT,
  vendor TEXT,
  discontinued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(supplier, sku)
);

-- Enable RLS
ALTER TABLE public.discontinued_products ENABLE ROW LEVEL SECURITY;

-- Admins can view discontinued products
CREATE POLICY "Admins can view discontinued products"
  ON public.discontinued_products
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage discontinued products
CREATE POLICY "Service role can manage discontinued products"
  ON public.discontinued_products
  FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Add index for fast lookups
CREATE INDEX idx_discontinued_products_supplier_sku ON public.discontinued_products(supplier, sku);

-- Add discontinued flag to supplier_products table
ALTER TABLE public.supplier_products ADD COLUMN IF NOT EXISTS is_discontinued BOOLEAN DEFAULT false;