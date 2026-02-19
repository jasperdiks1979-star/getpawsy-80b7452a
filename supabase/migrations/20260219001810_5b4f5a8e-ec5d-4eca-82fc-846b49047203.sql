
-- Fix overly permissive policy on gsc_keywords
-- Drop the catch-all and replace with no public write (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role full access on gsc_keywords" ON public.gsc_keywords;
