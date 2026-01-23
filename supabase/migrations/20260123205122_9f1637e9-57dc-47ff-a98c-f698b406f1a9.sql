-- Fix security vulnerability: Remove overly permissive RLS policies

-- 1. Drop the "Anyone can update tracking events" policy on remarketing_emails
-- Edge function already uses service role, so tracking will still work
DROP POLICY IF EXISTS "Anyone can update tracking events" ON public.remarketing_emails;

-- 2. Drop the contradictory "Users can update their own cart by session_id" policy on abandoned_carts
-- This policy has USING(false) WITH CHECK(true) which is logically broken
DROP POLICY IF EXISTS "Users can update their own cart by session_id" ON public.abandoned_carts;