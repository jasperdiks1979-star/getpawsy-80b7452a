
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS verification_state text,
  ADD COLUMN IF NOT EXISTS verification_score int,
  ADD COLUMN IF NOT EXISTS verification_checks jsonb,
  ADD COLUMN IF NOT EXISTS verification_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_failure_reason text;

CREATE INDEX IF NOT EXISTS idx_pin_queue_verification_state
  ON public.pinterest_pin_queue (verification_state, last_verified_at)
  WHERE status = 'posted';
