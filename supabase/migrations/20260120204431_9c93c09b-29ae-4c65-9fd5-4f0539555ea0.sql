-- Fix the orders table RLS policy vulnerability
-- The current policy allows email-based access which can be exploited

-- Step 1: Add order_access_token column for secure guest order access
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_access_token TEXT;

-- Create an index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_orders_access_token ON public.orders(order_access_token) WHERE order_access_token IS NOT NULL;

-- Step 2: Drop the vulnerable policy
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

-- Step 3: Create a secure policy that only uses user_id (no email lookup)
-- Guest orders will be accessed via a secure edge function with token validation
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- Step 4: Generate access tokens for existing guest orders (orders without user_id)
UPDATE public.orders 
SET order_access_token = encode(gen_random_bytes(32), 'hex')
WHERE user_id IS NULL AND order_access_token IS NULL;