
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS qa_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE INDEX IF NOT EXISTS idx_pin_queue_qa_reasons ON public.pinterest_pin_queue USING GIN (qa_reasons);

-- Lock down the queue: anything not the approved litter box → skipped
UPDATE public.pinterest_pin_queue
SET status = 'skipped',
    qa_reasons = ARRAY['allowlist_disabled'],
    error_message = 'Auto-skipped: only Automatic Cat Litter Box is allowed during QA stabilization'
WHERE status IN ('draft','queued','scheduled')
  AND product_slug <> 'automatic-cat-litter-box-self-cleaning-app-control';
