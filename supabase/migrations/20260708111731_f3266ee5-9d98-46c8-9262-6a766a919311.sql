UPDATE public.pinterest_pin_queue q
SET status = 'draft',
    rejection_reason = NULL,
    recovery_trace = COALESCE(q.recovery_trace, '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        'event','oos_cleared_requeue',
        'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'wave','final_recovery_2026_07_08'
      )),
    updated_at = now()
FROM public.products p
WHERE q.product_id = p.id
  AND q.status = 'rejected'
  AND q.rejection_reason = 'product_oos'
  AND p.is_active = true
  -- Pre-filter rows that would trip the enforce_pin_copy_rules trigger
  AND NOT (
    lower(
      coalesce(q.pin_title,'') || ' ' ||
      coalesce(q.pin_description,'') || ' ' ||
      coalesce(q.overlay_text,'') || ' ' ||
      replace(replace(replace(coalesce(q.pin_image_url,''),'%20',' '),'%0A',' '),'+',' ') || ' ' ||
      coalesce(q.meta::text,'')
    ) ~ '(stop scooping|large space, no pressure|a box that manages itself|shop the upgrade|discover why|save for later|tired of litter|no more plastic bag|plush, warm, easy to wash|plush warm easy to wash|shop the viral find|explore the trend|see it in action|see the setup|clean with ease|automate it|tired of litter box chores|tired of|read reviews|see how)'
  )
  AND char_length(coalesce(q.overlay_text,'')) <= 32
  AND coalesce(q.overlay_text,'') !~ '[\r\n|•]';