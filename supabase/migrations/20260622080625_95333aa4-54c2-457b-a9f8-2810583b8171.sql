
-- 1) Repair stale supplier slugs on video assets to match canonical product slugs
UPDATE pinterest_video_assets SET product_slug='star-moon-cat-scratcher-sofa', updated_at=now() WHERE product_slug='c-sofa-star-moon-56';
UPDATE pinterest_video_assets SET product_slug='bubble-fish-cat-scratcher-sofa', updated_at=now() WHERE product_slug='c-sofa-bubble-fish-56';
UPDATE pinterest_video_assets SET product_slug='versatile-accordion-cat-scratcher', updated_at=now() WHERE product_slug='the-versatile-accordion';
UPDATE pinterest_video_assets SET product_slug='double-layer-sisal-cat-scratcher', updated_at=now() WHERE product_slug='double-layer-sisal-mattress';

-- 2) Re-arm DESTINATION_PRODUCT_MISMATCH publish_blocked rows
UPDATE pinterest_video_queue
SET status='draft', error_message=NULL, attempt_count=0, last_retry_at=NULL, updated_at=now()
WHERE status='publish_blocked' AND error_message LIKE 'DESTINATION_PRODUCT_MISMATCH%';

-- 3) Re-arm CANONICAL_DUPLICATE_SLUG false positives whose slug is a legitimate canonical product
UPDATE pinterest_video_queue q
SET status='draft', error_message=NULL, attempt_count=0, last_retry_at=NULL, updated_at=now()
FROM pinterest_video_assets a, products p
WHERE q.asset_id = a.id
  AND p.slug = a.product_slug
  AND q.error_message LIKE 'CANONICAL_DUPLICATE_SLUG%'
  AND q.status IN ('failed','duplicate','publish_blocked');
