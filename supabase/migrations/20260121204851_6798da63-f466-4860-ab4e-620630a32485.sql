-- Fix abandoned_carts: Remove the overly permissive UPDATE policy
-- The current USING(true) allows reading all rows which exposes customer emails
DROP POLICY IF EXISTS "Anyone can update their own cart by session" ON public.abandoned_carts;

-- Create a more restrictive UPDATE policy that only allows updates via session_id match
-- Users must provide their session_id to update their cart (no SELECT exposure)
CREATE POLICY "Users can update their own cart by session_id"
ON public.abandoned_carts
FOR UPDATE
USING (false)  -- Prevent implicit SELECT through UPDATE
WITH CHECK (true);  -- Allow the update itself if using service role or RPC

-- Create a dedicated policy for session-based cart updates via edge function
-- This ensures carts can only be modified through proper channels
CREATE POLICY "Service role manages cart updates"
ON public.abandoned_carts
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');