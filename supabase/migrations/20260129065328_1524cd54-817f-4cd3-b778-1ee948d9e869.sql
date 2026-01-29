-- ============================================================
-- SECURITY FIX: Address error-level security findings
-- These fixes ensure proper RLS protection for sensitive data
-- ============================================================

-- ============================================================
-- 1. FIX: Profiles table - Ensure only authenticated users can view their own profile
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- ============================================================
-- 2. FIX: Abandoned carts - Add restrictive SELECT policy
-- Only admins and service role should be able to read abandoned cart data
-- ============================================================
DROP POLICY IF EXISTS "Admins can view abandoned carts" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Anyone can read abandoned carts" ON public.abandoned_carts;

CREATE POLICY "Only admins can view abandoned carts" 
ON public.abandoned_carts 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR auth.role() = 'service_role'
);

-- ============================================================
-- 3. FIX: Contact messages - Ensure restrictive SELECT policy
-- Only admins should be able to read contact messages
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Public can read contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admins can view contact messages" ON public.contact_messages;

CREATE POLICY "Only admins can view contact messages" 
ON public.contact_messages 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR auth.role() = 'service_role'
);

-- ============================================================
-- 4. FIX: Orders - Strengthen RLS policies
-- Users should only see their own orders, admins see all
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;

-- Users can view orders linked to their user_id
CREATE POLICY "Users can view their own orders" 
ON public.orders 
FOR SELECT 
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
);

-- ============================================================
-- 5. FIX: Newsletter subscribers - Add restrictive SELECT policy
-- Only admins should be able to read subscriber data
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view newsletter subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Public can view newsletter subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Admins can view newsletter subscribers" ON public.newsletter_subscribers;

CREATE POLICY "Only admins can view newsletter subscribers" 
ON public.newsletter_subscribers 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR auth.role() = 'service_role'
);

-- ============================================================
-- 6. FIX: Disputes - Strengthen customer SELECT policy
-- Ensure authenticated customers can only view their own disputes
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view disputes" ON public.disputes;
DROP POLICY IF EXISTS "Public can view disputes" ON public.disputes;
DROP POLICY IF EXISTS "Customers can view their own disputes" ON public.disputes;
DROP POLICY IF EXISTS "Admins can view all disputes" ON public.disputes;

-- Customers can only view disputes linked to their authenticated email
CREATE POLICY "Customers can view their own disputes" 
ON public.disputes 
FOR SELECT 
USING (
  -- Check if authenticated user's email matches the dispute email
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.email = disputes.customer_email
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
);