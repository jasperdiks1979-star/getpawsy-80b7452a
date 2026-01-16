-- Create bestsellers table for featured products with SEO content
CREATE TABLE public.bestsellers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  rank INTEGER NOT NULL DEFAULT 1,
  is_manual BOOLEAN NOT NULL DEFAULT true,
  seo_title TEXT,
  seo_description TEXT,
  hero_headline TEXT,
  hero_subheadline TEXT,
  selling_points JSONB DEFAULT '[]'::jsonb,
  long_description TEXT,
  meta_keywords TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bestsellers ENABLE ROW LEVEL SECURITY;

-- Public read access for active bestsellers
CREATE POLICY "Bestsellers are viewable by everyone" 
ON public.bestsellers 
FOR SELECT 
USING (is_active = true);

-- Admin only for modifications
CREATE POLICY "Only admins can insert bestsellers" 
ON public.bestsellers 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update bestsellers" 
ON public.bestsellers 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete bestsellers" 
ON public.bestsellers 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for faster lookups
CREATE INDEX idx_bestsellers_slug ON public.bestsellers(slug);
CREATE INDEX idx_bestsellers_product_id ON public.bestsellers(product_id);
CREATE INDEX idx_bestsellers_rank ON public.bestsellers(rank);

-- Add trigger for updated_at
CREATE TRIGGER update_bestsellers_updated_at
BEFORE UPDATE ON public.bestsellers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();