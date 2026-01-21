-- Create product_bundles table for storing bundle configurations
CREATE TABLE public.product_bundles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  product_ids UUID[] NOT NULL,
  discount_percentage NUMERIC NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  times_purchased INTEGER NOT NULL DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Bundles are publicly readable" 
ON public.product_bundles 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can view all bundles" 
ON public.product_bundles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert bundles" 
ON public.product_bundles 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update bundles" 
ON public.product_bundles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete bundles" 
ON public.product_bundles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_product_bundles_updated_at
BEFORE UPDATE ON public.product_bundles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();