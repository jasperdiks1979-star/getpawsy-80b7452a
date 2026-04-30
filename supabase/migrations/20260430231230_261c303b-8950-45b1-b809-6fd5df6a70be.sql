
ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS cta_copy_label TEXT,
  ADD COLUMN IF NOT EXISTS cta_copy_mode  TEXT;

CREATE INDEX IF NOT EXISTS lp_funnel_events_copy_idx
  ON public.lp_funnel_events (placement, cta_copy_mode, cta_copy_label, created_at DESC)
  WHERE cta_copy_label IS NOT NULL;
