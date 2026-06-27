
-- Promote diverse drafts → queued, max 2 per product, staggered every 30 min.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY product_slug
           ORDER BY created_at DESC
         ) AS rn_prod,
         ROW_NUMBER() OVER (ORDER BY product_slug, created_at DESC) AS rn_global
  FROM pinterest_pin_queue
  WHERE status = 'draft'
), eligible AS (
  SELECT id, rn_global FROM ranked WHERE rn_prod <= 2 ORDER BY rn_global LIMIT 40
)
UPDATE pinterest_pin_queue q
SET status = 'queued',
    approved_at = now(),
    scheduled_at = now() + (e.rn_global * interval '30 minutes'),
    error_message = NULL,
    publishing_started_at = NULL
FROM eligible e
WHERE q.id = e.id;
