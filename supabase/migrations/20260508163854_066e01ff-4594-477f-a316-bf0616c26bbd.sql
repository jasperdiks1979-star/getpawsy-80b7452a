UPDATE pinterest_pin_queue
SET status = 'rejected',
    rejection_reason = COALESCE(rejection_reason, 'superseded_typography_clipping_fix'),
    approved_at = NULL
WHERE product_slug = 'automatic-cat-litter-box-self-cleaning-app-control'
  AND status IN ('queued','draft')
  AND created_at > now() - interval '24 hours';