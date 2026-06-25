UPDATE public.pinterest_credit_state
SET daily_image_credit_cap = 7500,
    manual_pause = false,
    manual_pause_reason = NULL,
    notes = COALESCE(notes, '') || E'\n[' || now()::text || '] growth-incident: raised daily image cap 5000->7500 and cleared manual_pause to allow AI Creative Director to resume publishing.'
WHERE id = 1;