-- Fix profiles RLS: Remove redundant policies and create a single consolidated SELECT policy
-- that only allows users to view their own profile OR admins to view all

-- Drop the existing overlapping SELECT policies
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create single consolidated SELECT policy that restricts access properly
CREATE POLICY "Users can view own profile, admins can view all"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role)
);