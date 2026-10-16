-- Reversible: DROP TABLE public.analytics_job_leases; ALTER TABLE public.canonical_sessions DROP COLUMN shadow_classifier_version, DROP COLUMN shadow_classified_at;
ALTER TABLE public.canonical_sessions
  ADD COLUMN IF NOT EXISTS shadow_classifier_version text,
  ADD COLUMN IF NOT EXISTS shadow_classified_at timestamptz;
COMMENT ON COLUMN public.canonical_sessions.shadow_classifier_version IS 'Written only by analytics-shadow-classifier; not touched by classify triggers.';

CREATE TABLE public.analytics_job_leases (
  job text PRIMARY KEY,
  holder text,
  locked_until timestamptz NOT NULL DEFAULT 'epoch',
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_job_leases TO service_role;
ALTER TABLE public.analytics_job_leases ENABLE ROW LEVEL SECURITY;
INSERT INTO public.analytics_job_leases (job) VALUES ('shadow_classifier') ON CONFLICT DO NOTHING;