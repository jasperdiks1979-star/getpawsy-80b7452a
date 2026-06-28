UPDATE public.pinterest_creative_factory_settings
SET max_jobs_per_run = 10, max_concurrency = 3, updated_at = now()
WHERE id = 1;

UPDATE public.pinterest_pin_queue
SET status='queued', approved_at = COALESCE(approved_at, now()), updated_at = now()
WHERE status='draft' AND pin_image_url IS NOT NULL AND pin_image_url <> '';