-- Phase 4 observability: persist motion-quality breakdown + per-attempt event log

ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS motion_quality_breakdown jsonb;

CREATE TABLE IF NOT EXISTS public.cinematic_motion_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.cinematic_ad_jobs(id) ON DELETE CASCADE,
  product_slug text,
  source text NOT NULL,                  -- 'renderer' | 'validator'
  attempt_number int NOT NULL DEFAULT 0, -- = motion_regen_attempts at evaluation time
  score int,                             -- composite 0..100
  threshold int,                         -- motion_quality_min_score in effect
  passed boolean,
  decision text,                         -- 'pass' | 'regen_queued' | 'manual_review' | 'measured'
  max_regen_attempts int,
  breakdown jsonb,                       -- { sceneRate, flowScore, camScore, composite, ... }
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cmqe_job_created_idx
  ON public.cinematic_motion_quality_events (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cmqe_created_idx
  ON public.cinematic_motion_quality_events (created_at DESC);

GRANT SELECT ON public.cinematic_motion_quality_events TO authenticated;
GRANT ALL ON public.cinematic_motion_quality_events TO service_role;

ALTER TABLE public.cinematic_motion_quality_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all events; service_role bypasses RLS for inserts from edge functions.
CREATE POLICY "Admins can read motion quality events"
  ON public.cinematic_motion_quality_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
