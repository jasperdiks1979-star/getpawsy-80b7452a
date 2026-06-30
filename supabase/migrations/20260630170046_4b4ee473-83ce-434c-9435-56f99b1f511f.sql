-- Flip SECURITY DEFINER views to SECURITY INVOKER so they respect the caller's RLS.
ALTER VIEW IF EXISTS public.products_detail SET (security_invoker = true);
ALTER VIEW IF EXISTS public.products_public SET (security_invoker = true);
ALTER VIEW IF EXISTS public.pinterest_revenue_funnel_daily SET (security_invoker = true);