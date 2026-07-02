-- Ensure the public catalog view runs with the owner's privileges (bypasses RLS on products safely; view already filters to safe rows)
ALTER VIEW public.products_public SET (security_invoker = off);

-- Grant read access to anonymous and authenticated roles (was missing → PostgREST returned []).
GRANT SELECT ON public.products_public TO anon, authenticated;
GRANT SELECT ON public.products_public TO service_role;