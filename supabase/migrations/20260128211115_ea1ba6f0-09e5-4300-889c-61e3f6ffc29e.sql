-- Fix 1: Profiles table - Users should only see their OWN profile
-- Drop the existing overly permissive policy and create a proper one
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Fix 2: Products table - Create a public view that excludes sensitive cost data
-- First, check if the view exists and drop it
DROP VIEW IF EXISTS public.products_public;

-- Create a secure view for public product access (excludes cost_price and supplier_name)
CREATE VIEW public.products_public
WITH (security_invoker=on) AS
  SELECT 
    id,
    name,
    slug,
    description,
    price,
    compare_at_price,
    category,
    image_url,
    images,
    stock,
    sku,
    cj_product_id,
    variants,
    weight,
    shipping_time,
    is_active,
    created_at,
    updated_at
  FROM public.products
  WHERE is_active = true;

-- Update products table policy to only allow admin/service_role SELECT
-- First drop the existing public select policy if it exists
DROP POLICY IF EXISTS "Products are publicly readable" ON public.products;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;

-- Create new restrictive policy - only admins and service role can see all product data (including cost_price)
CREATE POLICY "Admins can view all products" 
ON public.products 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role');

-- Fix 3: Stock notifications - Allow users to delete their own notification by email
-- The table already has INSERT policy, we need a DELETE policy

-- First, ensure the user can verify ownership via their authenticated email
CREATE POLICY "Users can delete their own stock notifications" 
ON public.stock_notifications 
FOR DELETE 
USING (
  -- Allow if the user is authenticated and the email matches their profile email
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.email = stock_notifications.email
  )
  OR
  -- Or if service role
  auth.role() = 'service_role'
);