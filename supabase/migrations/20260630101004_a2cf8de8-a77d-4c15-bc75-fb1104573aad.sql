
-- Daily breakdown by status + rejection_reason
CREATE OR REPLACE VIEW public.v_pin_queue_daily_breakdown AS
SELECT
  date_trunc('day', COALESCE(updated_at, created_at))::date AS day,
  status,
  COALESCE(NULLIF(rejection_reason, ''), '(none)') AS rejection_reason,
  COUNT(*)::bigint AS pin_count,
  COUNT(DISTINCT product_id)::bigint AS product_count
FROM public.pinterest_pin_queue
WHERE COALESCE(updated_at, created_at) >= now() - interval '30 days'
GROUP BY 1, 2, 3;

-- Daily breakdown by product + status + rejection_reason
CREATE OR REPLACE VIEW public.v_pin_queue_daily_by_product AS
SELECT
  date_trunc('day', COALESCE(q.updated_at, q.created_at))::date AS day,
  q.product_id,
  p.name AS product_name,
  p.slug AS product_slug,
  q.status,
  COALESCE(NULLIF(q.rejection_reason, ''), '(none)') AS rejection_reason,
  COUNT(*)::bigint AS pin_count
FROM public.pinterest_pin_queue q
LEFT JOIN public.products p ON p.id = q.product_id
WHERE COALESCE(q.updated_at, q.created_at) >= now() - interval '30 days'
GROUP BY 1, 2, 3, 4, 5, 6;

REVOKE ALL ON public.v_pin_queue_daily_breakdown FROM anon, authenticated;
REVOKE ALL ON public.v_pin_queue_daily_by_product FROM anon, authenticated;
GRANT SELECT ON public.v_pin_queue_daily_breakdown TO service_role;
GRANT SELECT ON public.v_pin_queue_daily_by_product TO service_role;

-- Secure-definer RPCs (admin-only) so the admin UI can read via PostgREST
CREATE OR REPLACE FUNCTION public.get_pin_queue_daily_breakdown(_days int DEFAULT 14)
RETURNS TABLE(day date, status text, rejection_reason text, pin_count bigint, product_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT day, status, rejection_reason, pin_count, product_count
  FROM public.v_pin_queue_daily_breakdown
  WHERE day >= (now() - (_days || ' days')::interval)::date
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY day DESC, pin_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_pin_queue_daily_by_product(_days int DEFAULT 14, _limit int DEFAULT 500)
RETURNS TABLE(day date, product_id uuid, product_name text, product_slug text, status text, rejection_reason text, pin_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT day, product_id, product_name, product_slug, status, rejection_reason, pin_count
  FROM public.v_pin_queue_daily_by_product
  WHERE day >= (now() - (_days || ' days')::interval)::date
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY day DESC, pin_count DESC
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.get_pin_queue_daily_breakdown(int) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_pin_queue_daily_by_product(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_pin_queue_daily_breakdown(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pin_queue_daily_by_product(int, int) TO authenticated;
