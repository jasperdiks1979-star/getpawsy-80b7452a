-- Create table for bookmarked CJ products
CREATE TABLE public.cj_product_bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cj_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_image TEXT,
  sell_price NUMERIC,
  category_name TEXT,
  product_weight NUMERIC,
  product_sku TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, cj_product_id)
);

-- Enable RLS
ALTER TABLE public.cj_product_bookmarks ENABLE ROW LEVEL SECURITY;

-- Admins can view their own bookmarks
CREATE POLICY "Admins can view their own bookmarks"
ON public.cj_product_bookmarks
FOR SELECT
USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert their own bookmarks
CREATE POLICY "Admins can insert their own bookmarks"
ON public.cj_product_bookmarks
FOR INSERT
WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete their own bookmarks
CREATE POLICY "Admins can delete their own bookmarks"
ON public.cj_product_bookmarks
FOR DELETE
USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));