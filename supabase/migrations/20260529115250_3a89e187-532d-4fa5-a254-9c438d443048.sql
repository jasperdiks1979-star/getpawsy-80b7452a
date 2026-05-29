ALTER TABLE public.lp_funnel_events ADD COLUMN IF NOT EXISTS landing_page text;
CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_utm_source_created
  ON public.lp_funnel_events (utm_source, created_at DESC);