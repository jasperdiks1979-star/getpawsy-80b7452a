ALTER TABLE public.cta_copy_winners_by_hook
  ADD COLUMN IF NOT EXISTS guardrail_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardrail_reason TEXT,
  ADD COLUMN IF NOT EXISTS guardrail_evaluated_at TIMESTAMPTZ;

ALTER TABLE public.cohort_copy_pin_history
  DROP CONSTRAINT IF EXISTS cohort_copy_pin_history_action_check;

ALTER TABLE public.cohort_copy_pin_history
  ADD CONSTRAINT cohort_copy_pin_history_action_check
  CHECK (action IN ('pin','unpin','decay','guardrail','guardrail_clear'));