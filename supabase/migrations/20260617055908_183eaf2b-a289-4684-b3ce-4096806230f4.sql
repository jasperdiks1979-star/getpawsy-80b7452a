
CREATE OR REPLACE FUNCTION public.pinterest_guard_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deactivated int := 0;
  v_cancelled jsonb := '{}'::jsonb;
  v_cancel_total int := 0;
  r record;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Permit deactivation for this transaction (existing safety trigger respects this flag).
  PERFORM set_config('app.allow_deactivate', 'true', true);

  WITH retired AS (
    UPDATE public.products
    SET is_active = false,
        inventory_manual_block = true,
        updated_at = now()
    WHERE is_active = true
      AND (
        slug ILIKE '%self-pickup%'
        OR name ILIKE '%self-pickup%'
        OR slug ILIKE '%electric-shock%'
        OR name ILIKE '%electric shock%'
        OR name ILIKE '%shock collar%'
        OR slug = 'only-self-pickup-all-stainless-steel-cat-litter-box-k1'
      )
    RETURNING id
  )
  SELECT count(*) INTO v_deactivated FROM retired;

  FOR r IN
    WITH cancelled AS (
      UPDATE public.pinterest_pin_queue q
      SET status = 'cancelled',
          error_message = 'destination_guard:' || x.reason,
          updated_at = now()
      FROM (
        SELECT q2.id,
          CASE
            WHEN p.id IS NULL THEN 'product_missing'
            WHEN p.is_active = false THEN 'inactive_product'
            WHEN p.availability IS DISTINCT FROM 'in stock' THEN 'out_of_stock'
            WHEN p.supplier_warehouse IN ('UNKNOWN','none','') OR p.supplier_warehouse IS NULL THEN 'no_warehouse'
            WHEN p.slug ILIKE '%self-pickup%' OR p.slug ILIKE '%electric-shock%' THEN 'banned_term'
            ELSE NULL
          END AS reason
        FROM public.pinterest_pin_queue q2
        LEFT JOIN public.products p ON p.id = q2.product_id
        WHERE q2.status = 'pending'
      ) x
      WHERE q.id = x.id AND x.reason IS NOT NULL
      RETURNING x.reason
    )
    SELECT reason, count(*)::int AS n FROM cancelled GROUP BY reason
  LOOP
    v_cancelled := v_cancelled || jsonb_build_object(r.reason, r.n);
    v_cancel_total := v_cancel_total + r.n;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'products_deactivated', v_deactivated,
    'queue_cancelled_total', v_cancel_total,
    'queue_cancelled_by_reason', v_cancelled,
    'ran_at', now()
  );
END;
$$;
