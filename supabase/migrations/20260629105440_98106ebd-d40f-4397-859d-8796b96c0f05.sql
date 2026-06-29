
-- Emergency repair: queued pin_queue rows are stuck because pin_image_url was
-- never copied from their linked pcie2_creatives row, so the publish worker's
-- claim query (which requires pin_image_url IS NOT NULL) ignored all 19.
UPDATE public.pinterest_pin_queue q
SET pin_image_url = c.image_url,
    image_hash = COALESCE(q.image_hash, c.image_hash),
    pin_image_phash = COALESCE(q.pin_image_phash, c.perceptual_hash),
    updated_at = now()
FROM public.pcie2_creatives c
WHERE q.pcie2_creative_id = c.id
  AND q.status = 'queued'
  AND q.pin_image_url IS NULL
  AND c.image_url IS NOT NULL;

-- Mark the 3 orphan queued rows (no pcie2 link, no image) as failed so the
-- scheduler stops re-evaluating them and the dashboard reflects reality.
UPDATE public.pinterest_pin_queue
SET status = 'failed',
    error_message = COALESCE(error_message, 'auto: queued without image and no PCIE2 link'),
    updated_at = now()
WHERE status = 'queued'
  AND pin_image_url IS NULL
  AND pcie2_creative_id IS NULL;
