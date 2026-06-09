-- Restore anonymous read access to the public catalog views.
-- The base `products` table has no anon-facing SELECT policy (admin-only),
-- so views must run as the owner (security_invoker=false) for the public
-- shop, PDP, search, and bot prerender paths to return rows.
ALTER VIEW public.products_public SET (security_invoker = false);
ALTER VIEW public.products_detail SET (security_invoker = false);

GRANT SELECT ON public.products_public TO anon, authenticated;
GRANT SELECT ON public.products_detail TO anon, authenticated;
GRANT ALL    ON public.products_public TO service_role;
GRANT ALL    ON public.products_detail TO service_role;