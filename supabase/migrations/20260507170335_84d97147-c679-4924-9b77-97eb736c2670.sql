
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS publishing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_publish_error text;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_publish_ready
  ON public.pinterest_pin_queue (status, scheduled_at)
  WHERE status IN ('queued','publishing');

CREATE TABLE IF NOT EXISTS public.pinterest_publish_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id uuid REFERENCES public.pinterest_pin_queue(id) ON DELETE SET NULL,
  attempt int NOT NULL DEFAULT 1,
  status text NOT NULL,
  board_id text,
  image_url text,
  pin_title text,
  destination_link text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pinterest_publish_logs_created_at
  ON public.pinterest_publish_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinterest_publish_logs_pin_queue_id
  ON public.pinterest_publish_logs (pin_queue_id);

ALTER TABLE public.pinterest_publish_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read pinterest_publish_logs"
  ON public.pinterest_publish_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Backfill: orphaned queued pins with no approval go back to draft for review.
UPDATE public.pinterest_pin_queue
SET status = 'draft', error_message = COALESCE(error_message, 'Auto-recovered: queued without approval'),
    scheduled_at = COALESCE(scheduled_at, now())
WHERE status = 'queued' AND approved_at IS NULL;
