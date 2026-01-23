-- Fix abandoned_carts table RLS policy
-- The current "Anyone can insert abandoned carts" policy is too permissive
-- Replace it with a session-based insert that still allows cart tracking but prevents abuse

-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Anyone can insert abandoned carts" ON public.abandoned_carts;

-- Create a more restrictive insert policy that requires a valid session_id
-- This allows the cart tracking to work but prevents arbitrary data injection
CREATE POLICY "Cart tracking with session validation"
ON public.abandoned_carts
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Session ID must be at least 16 characters (UUID-like format)
  length(session_id) >= 16 
  -- Limit cart items to a reasonable size to prevent abuse
  AND jsonb_array_length(cart_items) <= 50
  -- Cart total must be reasonable
  AND cart_total >= 0
  AND cart_total <= 100000
);