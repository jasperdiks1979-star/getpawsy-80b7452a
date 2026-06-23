
DO $$
DECLARE
  retired_count int;
BEGIN
  PERFORM set_config('app.allow_deactivate', 'true', true);

  INSERT INTO public.discontinued_products (supplier, sku, product_name, vendor, discontinued_at)
  SELECT 'cj', COALESCE(cj_product_id, id::text), name, brand, now()
  FROM public.products
  WHERE is_active = true AND cj_variant_id IS NULL
  ON CONFLICT (supplier, sku) DO NOTHING;

  UPDATE public.products
  SET is_active = false,
      supplier_status = 'discontinued',
      updated_at = now()
  WHERE is_active = true AND cj_variant_id IS NULL;

  GET DIAGNOSTICS retired_count = ROW_COUNT;
  RAISE NOTICE 'Retired % discontinued products', retired_count;
END $$;
