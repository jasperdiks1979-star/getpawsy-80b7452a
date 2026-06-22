UPDATE pinterest_video_queue q
SET status='draft', error_message=NULL, attempt_count=0, last_retry_at=NULL, updated_at=now()
FROM pinterest_video_assets a, products p
WHERE q.asset_id = a.id
  AND p.slug = a.product_slug
  AND q.error_message LIKE 'CANONICAL_DUPLICATE_SLUG%'
  AND q.status IN ('failed','duplicate','publish_blocked');