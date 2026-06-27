
-- Pinterest queue dedupe: archive 229 duplicate-headline drafts so
-- DiversityGuard stops rejecting at score 60-61. Keeps the most recent
-- unique (product_slug, overlay_text) draft per group.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY product_slug, COALESCE(overlay_text, pin_title)
           ORDER BY created_at DESC
         ) AS rn
  FROM pinterest_pin_queue
  WHERE status = 'draft'
)
UPDATE pinterest_pin_queue q
SET status = 'rejected',
    rejection_reason = 'duplicate_headline_archived',
    error_message = 'archived by dedupe cleanup 2026-06-27'
FROM ranked r
WHERE q.id = r.id AND r.rn > 1;
