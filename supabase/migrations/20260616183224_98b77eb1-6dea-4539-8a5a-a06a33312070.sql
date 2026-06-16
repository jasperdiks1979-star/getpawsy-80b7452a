
ALTER TABLE public.pinterest_pin_queue DROP CONSTRAINT IF EXISTS pinterest_pin_queue_status_check;
ALTER TABLE public.pinterest_pin_queue ADD CONSTRAINT pinterest_pin_queue_status_check
  CHECK (status = ANY (ARRAY[
    'draft','queued','scheduled','publishing','posted','failed','paused','skipped','rejected','blocked_legacy_source'
  ]));
