ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS hook_family TEXT,
  ADD COLUMN IF NOT EXISTS cta_copy_source TEXT;

CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_hook_family
  ON public.lp_funnel_events (hook_family)
  WHERE hook_family IS NOT NULL;