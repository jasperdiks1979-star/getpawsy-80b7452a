ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS source_quality text;

CREATE INDEX IF NOT EXISTS idx_sessions_source_quality
  ON public.sessions (source_quality, started_at DESC);

COMMENT ON COLUMN public.sessions.source_quality IS
  'CI-3 traffic-source quality: premium | good | weak | curiosity_only | suspicious. Derived by ai-traffic-classify from dwell, scroll, ATC, in_app_browser, geo_quality.';