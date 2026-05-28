ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS quality_class TEXT;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_quality_class_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_quality_class_check
  CHECK (quality_class IS NULL OR quality_class IN ('real_human','suspicious','crawler','likely_bot'));

CREATE INDEX IF NOT EXISTS idx_sessions_quality_class
  ON public.sessions (quality_class)
  WHERE quality_class IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_started_at_quality
  ON public.sessions (started_at DESC)
  WHERE quality_class IS NULL;