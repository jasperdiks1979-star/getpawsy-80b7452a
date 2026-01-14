-- Create products table for storing CJ Dropshipping products
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cj_product_id TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  images TEXT[] DEFAULT '{}',
  price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  compare_at_price DECIMAL(10,2),
  sku TEXT,
  variants JSONB DEFAULT '[]',
  stock INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  weight DECIMAL(8,2),
  shipping_time TEXT,
  supplier_name TEXT DEFAULT 'CJ Dropshipping',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  parent_id UUID REFERENCES public.categories(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on products (public read, admin write)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Products are publicly readable
CREATE POLICY "Products are publicly readable"
  ON public.products FOR SELECT
  USING (is_active = true);

-- Categories are publicly readable
CREATE POLICY "Categories are publicly readable"
  ON public.categories FOR SELECT
  USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for products updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default categories for pet products
INSERT INTO public.categories (name, slug, description) VALUES
  ('Honden', 'honden', 'Producten voor honden'),
  ('Katten', 'katten', 'Producten voor katten'),
  ('Speelgoed', 'speelgoed', 'Speelgoed voor huisdieren'),
  ('Voeding', 'voeding', 'Voeding en snacks'),
  ('Verzorging', 'verzorging', 'Verzorgingsproducten'),
  ('Accessoires', 'accessoires', 'Accessoires en benodigdheden');