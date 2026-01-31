-- Fix 1: Pinterest Ads Storage Bucket - Restrict to admin-only uploads
-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can upload pinterest ads" ON storage.objects;
DROP POLICY IF EXISTS "Public can read pinterest ads" ON storage.objects;

-- Create admin-only upload policy
CREATE POLICY "Admins can upload pinterest ads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'pinterest-ads' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Add admin UPDATE policy
CREATE POLICY "Admins can update pinterest ads"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'pinterest-ads' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Add admin DELETE policy
CREATE POLICY "Admins can delete pinterest ads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'pinterest-ads' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Keep public read access for ad images (they need to be publicly viewable)
CREATE POLICY "Public can view pinterest ads"
ON storage.objects FOR SELECT
USING (bucket_id = 'pinterest-ads');

-- Fix 2: Products table - Remove public SELECT policy that exposes cost_price
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active products via view" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;

-- Recreate policy that requires using the products_public view for public access
-- This ensures cost_price and supplier_name are never exposed to non-admins
CREATE POLICY "Admin users can view all products"
ON public.products FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role');

-- Note: The products_public view already exists and excludes sensitive fields
-- Public users should use products_public view, not the products table directly