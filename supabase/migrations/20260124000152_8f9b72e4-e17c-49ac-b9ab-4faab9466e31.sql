-- Fix profiles table RLS policies
-- Current RESTRICTIVE policies require ALL to pass (broken logic)
-- Change to PERMISSIVE so users can view own profile OR admins can view all

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create correct PERMISSIVE policies (using OR logic)
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Fix orders table RLS policies
-- Same issue: RESTRICTIVE requires ALL to pass

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;

-- Create correct PERMISSIVE policies
CREATE POLICY "Users can view their own orders" 
ON public.orders 
FOR SELECT 
TO authenticated
USING ((auth.uid() = user_id) AND (user_id IS NOT NULL));

CREATE POLICY "Admins can view all orders" 
ON public.orders 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));