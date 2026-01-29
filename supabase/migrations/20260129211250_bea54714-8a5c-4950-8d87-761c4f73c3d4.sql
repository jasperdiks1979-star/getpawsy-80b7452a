-- Create table for storing imported supplier products
CREATE TABLE public.supplier_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier TEXT NOT NULL CHECK (supplier IN ('topdawg', 'petdropshipper', 'cj')),
  supplier_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  cost_price NUMERIC NOT NULL,
  msrp NUMERIC,
  weight NUMERIC,
  image_url TEXT,
  images TEXT[] DEFAULT '{}',
  sku TEXT,
  brand TEXT,
  stock_status TEXT DEFAULT 'in_stock',
  shipping_time TEXT DEFAULT '2-5 business days',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(supplier, supplier_product_id)
);

-- Create table for mapping our products to supplier alternatives
CREATE TABLE public.product_supplier_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_product_id UUID NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  match_score NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, supplier_product_id)
);

-- Create import logs table
CREATE TABLE public.supplier_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier TEXT NOT NULL,
  filename TEXT,
  total_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  imported_by UUID,
  status TEXT DEFAULT 'processing',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_supplier_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_import_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for supplier_products
CREATE POLICY "Admins can manage supplier products"
  ON public.supplier_products FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage supplier products"
  ON public.supplier_products FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for product_supplier_mappings
CREATE POLICY "Admins can manage supplier mappings"
  ON public.product_supplier_mappings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage supplier mappings"
  ON public.product_supplier_mappings FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for supplier_import_logs
CREATE POLICY "Admins can view import logs"
  ON public.supplier_import_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage import logs"
  ON public.supplier_import_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Add indexes for performance
CREATE INDEX idx_supplier_products_supplier ON public.supplier_products(supplier);
CREATE INDEX idx_supplier_products_name ON public.supplier_products USING gin(to_tsvector('english', product_name));
CREATE INDEX idx_product_supplier_mappings_product ON public.product_supplier_mappings(product_id);
CREATE INDEX idx_product_supplier_mappings_active ON public.product_supplier_mappings(is_active) WHERE is_active = true;

-- Add trigger for updated_at
CREATE TRIGGER update_supplier_products_updated_at
  BEFORE UPDATE ON public.supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_supplier_mappings_updated_at
  BEFORE UPDATE ON public.product_supplier_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();