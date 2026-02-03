-- Add a public SELECT policy for active products
-- This allows all visitors (including anonymous) to see active products

CREATE POLICY "Anyone can view active products" 
ON public.products 
FOR SELECT 
USING (is_active = true);