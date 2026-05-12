CREATE TABLE public.cohort_copy_pin_history (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('pin','unpin','decay')),
  placement TEXT NOT NULL,
  mode TEXT NOT NULL,
  hook_family TEXT NOT NULL,
  winning_label TEXT,
  actor TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cohort_copy_pin_history_cohort
  ON public.cohort_copy_pin_history (placement, mode, hook_family, created_at DESC);

CREATE INDEX idx_cohort_copy_pin_history_created
  ON public.cohort_copy_pin_history (created_at DESC);

ALTER TABLE public.cohort_copy_pin_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pin history"
  ON public.cohort_copy_pin_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));