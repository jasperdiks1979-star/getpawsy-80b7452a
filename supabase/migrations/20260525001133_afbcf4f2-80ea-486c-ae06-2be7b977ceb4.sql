
-- 1. cinematic_ad_jobs new columns (idempotent)
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remote_exists BOOLEAN,
  ADD COLUMN IF NOT EXISTS uniqueness_score INTEGER,
  ADD COLUMN IF NOT EXISTS publishable_reason TEXT,
  ADD COLUMN IF NOT EXISTS product_cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hook_cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_archived
  ON public.cinematic_ad_jobs (archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_remote_exists
  ON public.cinematic_ad_jobs (remote_exists, verified_at DESC);

-- 2. cinematic_ad_audit_events
CREATE TABLE IF NOT EXISTS public.cinematic_ad_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID,
  action TEXT NOT NULL,
  actor UUID,
  reason TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_audit_events_job
  ON public.cinematic_ad_audit_events (job_id, created_at DESC);

ALTER TABLE public.cinematic_ad_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit events" ON public.cinematic_ad_audit_events;
CREATE POLICY "Admins can read audit events"
  ON public.cinematic_ad_audit_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. pinterest_publish_verifications
CREATE TABLE IF NOT EXISTS public.pinterest_publish_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID,
  pin_id TEXT,
  pin_url TEXT,
  remote_exists BOOLEAN,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_pin_verif_job
  ON public.pinterest_publish_verifications (job_id, checked_at DESC);

ALTER TABLE public.pinterest_publish_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read pin verifications" ON public.pinterest_publish_verifications;
CREATE POLICY "Admins can read pin verifications"
  ON public.pinterest_publish_verifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. render_worker_heartbeats
CREATE TABLE IF NOT EXISTS public.render_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  queue_depth INTEGER,
  supabase_host TEXT,
  safe_mode BOOLEAN,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.render_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read worker heartbeats" ON public.render_worker_heartbeats;
CREATE POLICY "Admins can read worker heartbeats"
  ON public.render_worker_heartbeats FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
