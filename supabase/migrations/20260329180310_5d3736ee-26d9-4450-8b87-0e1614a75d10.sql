
-- 1. Fix review_requests: restrict to service_role only
DROP POLICY IF EXISTS "Service role full access on review_requests" ON public.review_requests;
CREATE POLICY "Service role full access on review_requests" ON public.review_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Fix ranking_defense: restrict insert/update to service_role
DROP POLICY IF EXISTS "Service can insert ranking_defense" ON public.ranking_defense;
DROP POLICY IF EXISTS "Service can update ranking_defense" ON public.ranking_defense;
CREATE POLICY "Service role can insert ranking_defense" ON public.ranking_defense FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update ranking_defense" ON public.ranking_defense FOR UPDATE TO service_role USING (true);

-- 3. Fix products cost_price leak: drop public SELECT policy
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
