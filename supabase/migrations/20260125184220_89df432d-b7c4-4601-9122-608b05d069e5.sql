-- First, drop any existing permissive SELECT policies on visitor_activity
DROP POLICY IF EXISTS "Anyone can view visitor activity" ON public.visitor_activity;
DROP POLICY IF EXISTS "Public can view visitor activity" ON public.visitor_activity;

-- Create restrictive SELECT policy for admins only
CREATE POLICY "Only admins can view visitor activity"
ON public.visitor_activity
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Ensure the INSERT policy allows tracking (already exists but let's make sure)
DROP POLICY IF EXISTS "Anyone can insert visitor activity" ON public.visitor_activity;
CREATE POLICY "Anyone can insert visitor activity"
ON public.visitor_activity
FOR INSERT
WITH CHECK (true);

-- Service role can manage all visitor activity
DROP POLICY IF EXISTS "Service role can manage visitor activity" ON public.visitor_activity;
CREATE POLICY "Service role can manage visitor activity"
ON public.visitor_activity
FOR ALL
USING (auth.role() = 'service_role');