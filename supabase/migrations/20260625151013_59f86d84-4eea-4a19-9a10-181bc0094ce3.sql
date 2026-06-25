
WITH paused AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM pinterest_pin_queue
  WHERE status='paused'
)
UPDATE pinterest_pin_queue p
SET status='queued',
    scheduled_at = now() + (paused.rn * interval '8 minutes')
FROM paused
WHERE p.id = paused.id;
