
-- ===== Factory jobs: recovery state =====
ALTER TABLE public.pinterest_creative_factory_jobs
  ADD COLUMN IF NOT EXISTS wow_batch_id text,
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_recovery_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_failure_fingerprint text,
  ADD COLUMN IF NOT EXISTS last_recovered_failure_fingerprint text,
  ADD COLUMN IF NOT EXISTS recovery_idempotency_key text;

ALTER TABLE public.pinterest_creative_factory_jobs
  DROP CONSTRAINT IF EXISTS pinterest_creative_factory_jobs_recovery_status_chk;
ALTER TABLE public.pinterest_creative_factory_jobs
  ADD CONSTRAINT pinterest_creative_factory_jobs_recovery_status_chk
  CHECK (recovery_status IN ('none','eligible','in_progress','cooldown','terminal','recovered'));

CREATE INDEX IF NOT EXISTS idx_pcfj_wow_batch ON public.pinterest_creative_factory_jobs (wow_batch_id) WHERE wow_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcfj_recovery_status ON public.pinterest_creative_factory_jobs (recovery_status) WHERE recovery_status <> 'none';

-- ===== Pin queue: recovery state =====
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS wow_batch_id text,
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_recovery_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_failure_fingerprint text,
  ADD COLUMN IF NOT EXISTS last_recovered_failure_fingerprint text,
  ADD COLUMN IF NOT EXISTS recovery_idempotency_key text;

ALTER TABLE public.pinterest_pin_queue
  DROP CONSTRAINT IF EXISTS pinterest_pin_queue_recovery_status_chk;
ALTER TABLE public.pinterest_pin_queue
  ADD CONSTRAINT pinterest_pin_queue_recovery_status_chk
  CHECK (recovery_status IN ('none','eligible','in_progress','cooldown','terminal','recovered'));

CREATE INDEX IF NOT EXISTS idx_ppq_wow_batch ON public.pinterest_pin_queue (wow_batch_id) WHERE wow_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppq_recovery_status ON public.pinterest_pin_queue (recovery_status) WHERE recovery_status <> 'none';

-- ===== Audit: idempotency key + mode on waves =====
ALTER TABLE public.pinterest_wow_recovery_audit
  ADD COLUMN IF NOT EXISTS recovery_idempotency_key text,
  ADD COLUMN IF NOT EXISTS failure_fingerprint text,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS reason_selected text,
  ADD COLUMN IF NOT EXISTS reason_skipped text,
  ADD COLUMN IF NOT EXISTS terminal_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wow_recovery_idempotency_key
  ON public.pinterest_wow_recovery_audit (recovery_idempotency_key)
  WHERE recovery_idempotency_key IS NOT NULL;

ALTER TABLE public.pinterest_wow_recovery_waves
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS wow_batch_id text,
  ADD COLUMN IF NOT EXISTS lock_acquired boolean,
  ADD COLUMN IF NOT EXISTS overlap_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS candidate_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skipped_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS terminalized_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS downstream_invoked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_render_exposure integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_conflicts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE public.pinterest_wow_recovery_waves
  DROP CONSTRAINT IF EXISTS pinterest_wow_recovery_waves_mode_chk;
ALTER TABLE public.pinterest_wow_recovery_waves
  ADD CONSTRAINT pinterest_wow_recovery_waves_mode_chk
  CHECK (mode IN ('dry_run','manual','cron','certify'));

-- ===== Advisory-lock RPCs =====
CREATE OR REPLACE FUNCTION public.try_wow_recovery_lock(_batch text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(hashtext('wow-batch-recovery:' || COALESCE(_batch,'*')));
$$;

CREATE OR REPLACE FUNCTION public.release_wow_recovery_lock(_batch text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(hashtext('wow-batch-recovery:' || COALESCE(_batch,'*')));
$$;

REVOKE ALL ON FUNCTION public.try_wow_recovery_lock(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_wow_recovery_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_wow_recovery_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_wow_recovery_lock(text) TO service_role;
