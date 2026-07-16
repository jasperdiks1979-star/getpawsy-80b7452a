UPDATE public.pinterest_pin_queue
SET status='posted', posted_at=COALESCE(posted_at, now()), updated_at=now()
WHERE id='f17b5e91-5da9-4578-9f94-3180e6fc83d5' AND pinterest_pin_id IS NOT NULL AND status='queued';