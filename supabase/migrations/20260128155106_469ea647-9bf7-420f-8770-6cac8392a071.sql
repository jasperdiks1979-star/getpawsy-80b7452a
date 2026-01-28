-- Fix the bestsellers RLS policy: change from RESTRICTIVE to PERMISSIVE
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Bestsellers are viewable by everyone" ON public.bestsellers;

-- Create a new PERMISSIVE policy (default is PERMISSIVE, which allows rows that match)
CREATE POLICY "Bestsellers are viewable by everyone"
ON public.bestsellers
FOR SELECT
TO public
USING (is_active = true);