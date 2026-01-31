-- Fix: Add input validation to disputes table RLS policy
-- This provides database-level defense-in-depth alongside edge function validation

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can create disputes" ON public.disputes;

-- Create validated INSERT policy for disputes
CREATE POLICY "Anyone can create valid disputes"
  ON public.disputes FOR INSERT
  WITH CHECK (
    -- Validate email format (basic regex)
    customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    AND length(customer_email) >= 5
    AND length(customer_email) <= 255
    -- Validate description length
    AND length(description) >= 10
    AND length(description) <= 5000
    -- Validate dispute_type is in allowed list
    AND dispute_type IN ('damaged', 'not_received', 'wrong_item', 'quality_issue', 'other')
  );