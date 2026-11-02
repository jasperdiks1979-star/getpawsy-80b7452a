\set ON_ERROR_STOP on
-- Isolated PostgreSQL 16 integration harness. NEVER run against production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE TABLE public.sync_progress (
  id text PRIMARY KEY,
  status text NOT NULL,
  last_offset integer NOT NULL,
  total_products integer NOT NULL,
  last_sync_at timestamptz,
  started_at timestamptz
);
INSERT INTO public.sync_progress
  (id, status, last_offset, total_products, last_sync_at, started_at)
VALUES ('stock-sync', 'running', 229, 773,
        clock_timestamp() - interval '2 hours',
        clock_timestamp() - interval '3 hours');
\ir ../supabase/migrations/20261101203000_stock_sync_recovery_lease.sql

DO $$
DECLARE n integer;
BEGIN
  IF has_function_privilege('anon', 'public.claim_stalled_stock_sync_recovery(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_stalled_stock_sync_recovery(integer)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.stock_sync_recovery_leases', 'SELECT') THEN
    RAISE EXCEPTION 'Recovery lease is exposed to non-service roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_stalled_stock_sync_recovery(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role cannot claim a recovery lease';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  IF public.claim_stalled_stock_sync_recovery(229) THEN
    RAISE EXCEPTION 'Anonymous JWT unexpectedly claimed recovery';
  END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  IF public.claim_stalled_stock_sync_recovery(228) OR
     public.claim_stalled_stock_sync_recovery(0) THEN
    RAISE EXCEPTION 'Wrong checkpoint accepted';
  END IF;
  IF NOT public.claim_stalled_stock_sync_recovery(229) THEN
    RAISE EXCEPTION 'First stale checkpoint claim rejected';
  END IF;
  IF public.claim_stalled_stock_sync_recovery(229) THEN
    RAISE EXCEPTION 'Active lease did not prevent a duplicate claim';
  END IF;

  -- Simulate expiry/backoff in this throwaway test database only.
  FOR n IN 2..3 LOOP
    UPDATE public.stock_sync_recovery_leases
       SET lease_until = clock_timestamp() - interval '1 minute',
           next_attempt_at = clock_timestamp() - interval '1 minute'
     WHERE id = 'stock-sync';
    IF NOT public.claim_stalled_stock_sync_recovery(229) THEN
      RAISE EXCEPTION 'Retry % was incorrectly rejected', n;
    END IF;
  END LOOP;
  UPDATE public.stock_sync_recovery_leases
     SET lease_until = clock_timestamp() - interval '1 minute',
         next_attempt_at = clock_timestamp() - interval '1 minute'
   WHERE id = 'stock-sync';
  IF public.claim_stalled_stock_sync_recovery(229) THEN
    RAISE EXCEPTION 'Fourth claim bypassed retry limit';
  END IF;
  SELECT attempts INTO n FROM public.stock_sync_recovery_leases WHERE id = 'stock-sync';
  IF n <> 3 THEN RAISE EXCEPTION 'Expected exactly 3 claims, got %', n; END IF;

  UPDATE public.sync_progress SET last_offset = 230,
    last_sync_at = clock_timestamp() - interval '2 hours'
    WHERE id = 'stock-sync';
  IF NOT public.claim_stalled_stock_sync_recovery(230) THEN
    RAISE EXCEPTION 'New checkpoint did not reset retry budget';
  END IF;
  SELECT attempts INTO n FROM public.stock_sync_recovery_leases WHERE id = 'stock-sync';
  IF n <> 1 THEN RAISE EXCEPTION 'New checkpoint attempts = %, expected 1', n; END IF;

  UPDATE public.sync_progress SET last_offset = 231,
    last_sync_at = clock_timestamp()
    WHERE id = 'stock-sync';
  IF public.claim_stalled_stock_sync_recovery(231) THEN
    RAISE EXCEPTION 'Fresh checkpoint was incorrectly treated as stalled';
  END IF;
  UPDATE public.sync_progress SET status = 'completed',
    last_sync_at = clock_timestamp() - interval '2 hours'
    WHERE id = 'stock-sync';
  IF public.claim_stalled_stock_sync_recovery(231) THEN
    RAISE EXCEPTION 'Completed sync was incorrectly recovered';
  END IF;
END $$;
