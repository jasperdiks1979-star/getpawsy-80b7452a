UPDATE public.pinterest_credit_state
SET forecast_state = 'green',
    manual_pause = false,
    ai_generation_paused = false,
    publishing_paused = false,
    image_generation_killed = false,
    autopilot_disabled = false,
    consecutive_402_count = 0,
    last_success_at = now(),
    updated_at = now(),
    notes = COALESCE(notes, '') || E'\n[' || now() || '] V9.6: verified gateway HTTP 200, balance 690 credits; cleared stale RED forecast + all pause flags.'
WHERE id = 1;