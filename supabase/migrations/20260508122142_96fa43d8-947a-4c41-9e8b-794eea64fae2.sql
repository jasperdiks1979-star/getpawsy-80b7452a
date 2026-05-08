
-- 1. Allow new statuses
ALTER TABLE public.pinterest_pin_queue
  DROP CONSTRAINT IF EXISTS pinterest_pin_queue_status_check;
ALTER TABLE public.pinterest_pin_queue
  ADD CONSTRAINT pinterest_pin_queue_status_check
  CHECK (status = ANY (ARRAY['draft','queued','scheduled','publishing','posted','failed','paused','skipped','rejected']));

-- 2. Auto-approve toggle
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS auto_approve_queue boolean NOT NULL DEFAULT false;

-- 3. Idempotency key
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE INDEX IF NOT EXISTS idx_pin_queue_idem ON public.pinterest_pin_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. Health aggregate RPC
CREATE OR REPLACE FUNCTION public.pinterest_publish_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  status_counts jsonb;
  recent_logs record;
  last_cron timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT jsonb_object_agg(status, c) INTO status_counts
  FROM (
    SELECT status, COUNT(*)::int AS c
    FROM public.pinterest_pin_queue
    GROUP BY status
  ) s;

  SELECT
    COUNT(*)::int AS attempts,
    COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
    AVG(duration_ms)::int AS avg_ms
  INTO recent_logs
  FROM (
    SELECT status, duration_ms FROM public.pinterest_publish_logs
    ORDER BY created_at DESC LIMIT 50
  ) l;

  SELECT MAX(started_at) INTO last_cron
  FROM public.cron_job_logs
  WHERE job_name LIKE 'pinterest%' OR job_name LIKE '%pinterest-cron%';

  result := jsonb_build_object(
    'queue_counts', COALESCE(status_counts, '{}'::jsonb),
    'recent_attempts', COALESCE(recent_logs.attempts, 0),
    'recent_successes', COALESCE(recent_logs.successes, 0),
    'avg_publish_ms', COALESCE(recent_logs.avg_ms, 0),
    'last_cron_run_at', last_cron,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.pinterest_publish_health() FROM public;
GRANT EXECUTE ON FUNCTION public.pinterest_publish_health() TO authenticated;
