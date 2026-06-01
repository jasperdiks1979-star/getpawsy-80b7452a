-- Admin preflight override for Pinterest Ad Studio
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS force_preflight_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_preflight_override_reason text,
  ADD COLUMN IF NOT EXISTS force_preflight_override_by uuid;

CREATE TABLE IF NOT EXISTS public.cinematic_preflight_override_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  product_slug text NOT NULL,
  user_id uuid,
  reason text,
  bypassed_reasons text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cinematic_preflight_override_log TO authenticated;
GRANT ALL ON public.cinematic_preflight_override_log TO service_role;

ALTER TABLE public.cinematic_preflight_override_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view preflight override log" ON public.cinematic_preflight_override_log;
CREATE POLICY "Admins view preflight override log"
  ON public.cinematic_preflight_override_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS cinematic_preflight_override_log_slug_idx
  ON public.cinematic_preflight_override_log (product_slug, created_at DESC);