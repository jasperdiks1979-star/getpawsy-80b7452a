-- Remove redundant "Deny anonymous access to orders" policy
-- The other policies already only grant access to 'authenticated' role, 
-- so anon users are already denied by default with RLS enabled.
DROP POLICY IF EXISTS "Deny anonymous access to orders" ON public.orders;