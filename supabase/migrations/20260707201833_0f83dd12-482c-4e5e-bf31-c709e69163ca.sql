CREATE OR REPLACE FUNCTION public.pinterest_recovery_jobs_lease_one()
RETURNS TABLE(id uuid, phase text, params jsonb, attempts int, max_attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT j.id INTO v_id
  FROM public.pinterest_recovery_jobs j
  WHERE j.status = 'pending'
  ORDER BY j.priority DESC, j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.pinterest_recovery_jobs j
  SET status = 'running',
      locked_at = now(),
      started_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = v_id
  RETURNING j.id, j.phase, j.params, j.attempts, j.max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.pinterest_recovery_jobs_lease_one() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pinterest_recovery_jobs_lease_one() TO service_role;