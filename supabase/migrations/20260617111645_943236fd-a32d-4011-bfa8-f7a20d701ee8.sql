
ALTER TABLE public.pinterest_credit_state
  ADD COLUMN IF NOT EXISTS autopilot_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_generation_killed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_image_credit_cap integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS min_balance_credits integer NOT NULL DEFAULT 700;

UPDATE public.pinterest_credit_state
SET autopilot_disabled = true,
    image_generation_killed = true,
    manual_pause = true,
    manual_pause_at = now(),
    manual_pause_reason = 'cost_protection_kill_switch_2026_06_17',
    ai_generation_paused = true,
    paused = true,
    state = 'red',
    daily_image_credit_cap = 200,
    min_balance_credits = 700,
    notes = COALESCE(notes,'') || E'\n[' || now()::text || '] HARD KILL SWITCH: autopilot disabled, image generation killed, CJ supplier images blocked from publishing.',
    updated_at = now()
WHERE id = 1;

UPDATE public.pinterest_pin_queue
SET status = 'rejected',
    rejection_reason = COALESCE(rejection_reason,'') || ' blocked_supplier_image',
    updated_at = now()
WHERE status IN ('queued','draft','approved')
  AND pin_image_url ~* '(cjdropshipping\.com|cjjsbox\.com|alicdn\.com|aliexpress\.com|alibaba\.com|1688\.com|dhgate\.com)';
