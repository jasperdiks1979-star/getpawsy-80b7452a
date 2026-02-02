-- =====================================================
-- SECURITY FIX: Harden RLS policies for profiles, orders, and visitor_activity
-- =====================================================

-- 1. PROFILES TABLE: Deny anonymous access explicitly
-- Drop existing SELECT policies and recreate with explicit authenticated requirement
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Recreate with explicit authenticated role requirement
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Explicitly deny anonymous access (defense in depth)
CREATE POLICY "Deny anonymous access to profiles" 
ON public.profiles FOR SELECT 
TO anon
USING (false);

-- 2. ORDERS TABLE: Fix guest order access vulnerability
-- Currently allows viewing orders where user_id IS NULL without any validation
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

-- Recreate with stricter policy - guest orders (user_id IS NULL) cannot be queried directly
-- They must use the lookup-guest-order edge function which validates email + access token
CREATE POLICY "Users can view their own orders" 
ON public.orders FOR SELECT 
TO authenticated
USING (
  -- Authenticated users can only see their own orders (not guest orders)
  auth.uid() = user_id
);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders" 
ON public.orders FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage all orders (for edge functions)
-- Already exists, no change needed

-- Deny anonymous access to orders table
CREATE POLICY "Deny anonymous access to orders" 
ON public.orders FOR SELECT 
TO anon
USING (false);

-- 3. VISITOR_ACTIVITY TABLE: Update INSERT validation to include product_view
DROP POLICY IF EXISTS "Anyone can insert valid visitor activity" ON public.visitor_activity;

-- Recreate with product_view included and additional validation
CREATE POLICY "Anyone can insert valid visitor activity" 
ON public.visitor_activity FOR INSERT 
WITH CHECK (
  -- Session ID validation
  length(session_id) >= 16 AND 
  length(session_id) <= 100 AND
  -- Valid activity types only
  activity_type = ANY (ARRAY['browsing'::text, 'cart'::text, 'checkout'::text, 'product_view'::text]) AND
  -- Prevent abuse: limit page_path length
  (page_path IS NULL OR length(page_path) <= 500) AND
  -- Prevent abuse: limit product_name length
  (product_name IS NULL OR length(product_name) <= 500) AND
  -- Prevent abuse: validate referrer_category if provided
  (referrer_category IS NULL OR referrer_category = ANY (ARRAY['google'::text, 'social'::text, 'direct'::text, 'email'::text, 'paid'::text, 'organic'::text, 'other'::text]))
);