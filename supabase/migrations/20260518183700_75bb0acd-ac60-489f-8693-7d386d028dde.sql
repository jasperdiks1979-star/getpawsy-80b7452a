ALTER TABLE public.pinterest_video_queue
  ADD COLUMN IF NOT EXISTS failure_payload jsonb;
COMMENT ON COLUMN public.pinterest_video_queue.failure_payload IS
  'Structured final failure record after all retries: { code, message, attempts: [{n, code, message, at, delay_ms}], finalized_at }';