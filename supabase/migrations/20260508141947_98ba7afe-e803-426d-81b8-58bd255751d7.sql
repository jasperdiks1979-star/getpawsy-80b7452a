UPDATE pinterest_pin_queue
SET status = 'rejected',
    last_publish_error = 'broken-render-pre-layout-engine',
    updated_at = now()
WHERE product_slug = 'automatic-cat-litter-box-self-cleaning-app-control'
  AND status = 'draft'
  AND created_at > now() - interval '24 hours'
  AND pin_variant ~ 'batch_2026050813(03|11|49|54)';