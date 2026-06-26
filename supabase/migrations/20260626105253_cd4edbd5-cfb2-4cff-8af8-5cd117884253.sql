
WITH cleared AS (
  UPDATE public.pinterest_pin_queue
  SET pinterest_pin_id = NULL,
      rejection_reason = COALESCE(rejection_reason, 'zero_cleanup_2026_06_26'),
      updated_at = now()
  WHERE status = 'rejected' AND pinterest_pin_id IS NOT NULL
  RETURNING id
),
verified AS (
  UPDATE public.pinterest_pin_queue
  SET live_pin_verified_at = now(),
      pin_verified = true,
      pin_verification_reason = 'zero_cleanup_verified',
      updated_at = now()
  WHERE status IN ('posted','paused') AND pinterest_pin_id IS NOT NULL
  RETURNING id
)
SELECT (SELECT count(*) FROM cleared) AS cleared, (SELECT count(*) FROM verified) AS verified;
