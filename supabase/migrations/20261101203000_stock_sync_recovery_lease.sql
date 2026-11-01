-- NOT APPLIED TO PRODUCTION. Review and deploy only after PR #32 authorization
-- and service-role cron compatibility are verified.
-- A single row provides an atomic, bounded recovery lease per checkpoint.
CREATE TABLE IF NOT EXISTS public.stock_sync_recovery_leases (
  id text PRIMARY KEY CHECK (id = 'stock-sync'),
  checkpoint integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  last_attempt_at timestamptz
);

ALTER TABLE public.stock_sync_recovery_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_sync_recovery_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_sync_recovery_leases TO service_role;

CREATE OR REPLACE FUNCTION public.claim_stalled_stock_sync_recovery(
  p_expected_offset integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  progress_row public.sync_progress%ROWTYPE;
  lease_row public.stock_sync_recovery_leases%ROWTYPE;
  now_at timestamptz := clock_timestamp();
  last_progress_at timestamptz;
BEGIN
  -- Never allow anon/authenticated callers to acquire a service recovery lease.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN false;
  END IF;

  -- Serializes claims with checkpoint writes, then rechecks the exact offset.
  SELECT * INTO progress_row FROM public.sync_progress
    WHERE id = 'stock-sync' FOR UPDATE;
  IF NOT FOUND OR p_expected_offset IS NULL OR p_expected_offset <= 0
     OR progress_row.status IS DISTINCT FROM 'running'
     OR progress_row.last_offset IS DISTINCT FROM p_expected_offset
     OR progress_row.total_products IS NULL
     OR progress_row.last_offset >= progress_row.total_products THEN
    RETURN false;
  END IF;

  last_progress_at := COALESCE(progress_row.last_sync_at, progress_row.started_at);
  IF last_progress_at IS NULL OR last_progress_at > now_at - interval '30 minutes' THEN
    RETURN false;
  END IF;

  INSERT INTO public.stock_sync_recovery_leases (id, checkpoint)
    VALUES ('stock-sync', p_expected_offset)
    ON CONFLICT (id) DO NOTHING;

  SELECT * INTO lease_row FROM public.stock_sync_recovery_leases
    WHERE id = 'stock-sync' FOR UPDATE;
  IF lease_row.lease_until > now_at THEN
    RETURN false;
  END IF;

  -- A new saved checkpoint gets a fresh, independently bounded retry budget.
  IF lease_row.checkpoint <> p_expected_offset THEN
    UPDATE public.stock_sync_recovery_leases
      SET checkpoint = p_expected_offset,
          attempts = 0,
          next_attempt_at = '-infinity'::timestamptz
      WHERE id = 'stock-sync';
    lease_row.attempts := 0;
    lease_row.next_attempt_at := '-infinity'::timestamptz;
  END IF;

  IF lease_row.attempts >= 3 OR lease_row.next_attempt_at > now_at THEN
    RETURN false;
  END IF;

  UPDATE public.stock_sync_recovery_leases
    SET attempts = lease_row.attempts + 1,
        last_attempt_at = now_at,
        lease_until = now_at + interval '5 minutes',
        next_attempt_at = now_at + make_interval(mins => 10 * (2 ^ lease_row.attempts)::integer)
    WHERE id = 'stock-sync';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stalled_stock_sync_recovery(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stalled_stock_sync_recovery(integer)
  TO service_role;
