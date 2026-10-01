ALTER TABLE public.crawler_visits
  ADD COLUMN IF NOT EXISTS crawler_identity text,
  ADD COLUMN IF NOT EXISTS crawler_family text,
  ADD COLUMN IF NOT EXISTS crawler_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crawler_verification_method text,
  ADD COLUMN IF NOT EXISTS crawler_confidence numeric,
  ADD COLUMN IF NOT EXISTS user_agent_family text,
  ADD COLUMN IF NOT EXISTS ip_hash text,
  ADD COLUMN IF NOT EXISTS crawler_reasons text[];
CREATE INDEX IF NOT EXISTS crawler_visits_identity_idx ON public.crawler_visits (crawler_identity, created_at DESC);
COMMENT ON COLUMN public.crawler_visits.ip_address IS 'DEPRECATED for new rows: replaced by ip_hash (privacy).';