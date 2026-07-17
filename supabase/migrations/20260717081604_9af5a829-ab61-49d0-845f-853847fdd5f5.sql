-- Revoke over-permissive grants left from earlier migration
REVOKE ALL ON public.pinterest_candidate_score_results FROM anon;
REVOKE ALL ON public.pinterest_candidate_score_results FROM authenticated;

-- Authenticated may attempt SELECT; RLS "admins read candidate scores" filters to admins only
GRANT SELECT ON public.pinterest_candidate_score_results TO authenticated;

-- Service role (edge functions) needs full access; RLS is bypassed for service_role
GRANT ALL ON public.pinterest_candidate_score_results TO service_role;