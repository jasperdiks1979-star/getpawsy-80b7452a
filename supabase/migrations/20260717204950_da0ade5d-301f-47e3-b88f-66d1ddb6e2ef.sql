
ALTER TABLE public.canonical_events
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_confidence numeric,
  ADD COLUMN IF NOT EXISTS bot_reason text,
  ADD COLUMN IF NOT EXISTS traffic_quality text NOT NULL DEFAULT 'uncertain',
  ADD COLUMN IF NOT EXISTS classification_version text,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_user_agent text,
  ADD COLUMN IF NOT EXISTS technical_path boolean NOT NULL DEFAULT false;

ALTER TABLE public.canonical_sessions
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_confidence numeric,
  ADD COLUMN IF NOT EXISTS bot_reason text,
  ADD COLUMN IF NOT EXISTS traffic_quality text NOT NULL DEFAULT 'uncertain',
  ADD COLUMN IF NOT EXISTS technical_path boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engagement_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interaction_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_traffic_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.traffic_quality NOT IN ('human','uncertain','bot','internal','technical') THEN
    RAISE EXCEPTION 'invalid traffic_quality: %', NEW.traffic_quality;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_traffic_quality_events ON public.canonical_events;
CREATE TRIGGER trg_validate_traffic_quality_events
  BEFORE INSERT OR UPDATE ON public.canonical_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_traffic_quality();

DROP TRIGGER IF EXISTS trg_validate_traffic_quality_sessions ON public.canonical_sessions;
CREATE TRIGGER trg_validate_traffic_quality_sessions
  BEFORE INSERT OR UPDATE ON public.canonical_sessions
  FOR EACH ROW EXECUTE FUNCTION public.validate_traffic_quality();

CREATE INDEX IF NOT EXISTS idx_canonical_events_traffic_quality
  ON public.canonical_events (traffic_quality, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_sessions_traffic_quality
  ON public.canonical_sessions (traffic_quality, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_events_technical_path
  ON public.canonical_events (technical_path) WHERE technical_path = true;
