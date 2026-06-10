
UPDATE public.pinterest_pin_queue
SET pin_title = 'Made for Multi-Cat Homes',
    overlay_text = 'Made for Multi-Cat Homes • Pull-out drawer + odor bags for fast cleanup',
    updated_at = now()
WHERE id = 'd2ebb817-2f28-4954-b786-c99d2c44f423';

UPDATE public.pinterest_live_pin_repair_queue
SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object(
      'row_19_revalidated_at', now(),
      'row_19_reason', 'overlay claimed self-cleaning on a manual covered drawer box; replaced with product-sourced drawer/odor-bag benefit',
      'row_19_new_pin_title', 'Made for Multi-Cat Homes',
      'row_19_new_overlay_text', 'Made for Multi-Cat Homes • Pull-out drawer + odor bags for fast cleanup'
    ),
    updated_at = now()
WHERE id = '006659fe-a8c1-4a93-b534-dfce3cb3daf8';
