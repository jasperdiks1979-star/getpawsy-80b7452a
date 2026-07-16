UPDATE public.pinterest_pin_queue
SET pin_image_url = 'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/double-layer-rice-cat-litter-mat/final-mat-only-1784204244640.png',
    status = 'draft',
    rejection_reason = NULL,
    error_message = NULL,
    qa_reasons = '{}',
    priority = 'high',
    overlay_text = NULL,
    pin_description = 'Double-layer rice cat litter mat — traps loose litter and cleans up easily for less mess around the box.',
    pin_title = 'Double-Layer Rice Cat Litter Mat',
    meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('photo_lock', true, 'photo_lock_method','mat_only_center_composite','photo_lock_at', now()::text, 'no_text_overlay', true, 'mat_occupancy_pct', 75),
    updated_at = now()
WHERE id = 'c67b4f77-37e1-4280-9db9-8048ab483ce5';