CREATE TABLE IF NOT EXISTS public.cinematic_worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_poll_at timestamptz NOT NULL DEFAULT now(),
  last_claim_at timestamptz,
  last_job_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cinematic_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view worker heartbeats" ON public.cinematic_worker_heartbeats;
CREATE POLICY "Admins can view worker heartbeats"
ON public.cinematic_worker_heartbeats FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cinematic_worker_heartbeats_last_poll
  ON public.cinematic_worker_heartbeats (last_poll_at DESC);