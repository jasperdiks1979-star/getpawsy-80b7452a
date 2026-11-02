-- DRAFT ONLY: do not deploy without isolated PostgreSQL tests, verified stock
-- policy and the separately reviewed deferred-retry worker.
-- Atomic no_data deferral: a scan cursor is NOT a verified-stock counter.
CREATE TABLE IF NOT EXISTS public.stock_sync_deferred (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_attempt_at timestamptz,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'exhausted', 'resolved')),
  last_offset integer NOT NULL CHECK (last_offset >= 0),
  reason text NOT NULL CHECK (reason = 'no_data'),
  message text NOT NULL DEFAULT '',
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS stock_sync_deferred_due_idx
  ON public.stock_sync_deferred (next_attempt_at)
  WHERE state = 'pending';
ALTER TABLE public.stock_sync_deferred ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_sync_deferred FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_sync_deferred TO service_role;

CREATE OR REPLACE FUNCTION public.defer_unverified_stock_sync_product(
  p_expected_offset integer,
  p_product_id uuid,
  p_reason text,
  p_message text DEFAULT ''
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  p public.sync_progress%ROWTYPE;
  expected_product uuid;
  catalog_total bigint;
  t timestamptz := clock_timestamp();
  next_offset integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS DISTINCT FROM 'no_data' OR p_expected_offset IS NULL
     OR p_expected_offset < 0 OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Invalid unverified stock deferral';
  END IF;

  SELECT * INTO p FROM public.sync_progress WHERE id='stock-sync' FOR UPDATE;
  IF NOT FOUND OR p.status IS DISTINCT FROM 'running'
     OR p.last_offset IS DISTINCT FROM p_expected_offset
     OR p.total_products IS NULL OR p_expected_offset >= p.total_products THEN
    RAISE EXCEPTION 'Stock checkpoint mismatch; deferral rejected';
  END IF;

  SELECT count(*) INTO catalog_total FROM public.products WHERE cj_product_id IS NOT NULL;
  IF catalog_total <> p.total_products THEN
    RAISE EXCEPTION 'Catalog count changed; checkpoint preserved';
  END IF;
  SELECT id INTO expected_product FROM public.products
    WHERE cj_product_id IS NOT NULL ORDER BY id
    LIMIT 1 OFFSET p_expected_offset;
  IF expected_product IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Wrong product at stock checkpoint; deferral rejected';
  END IF;

  INSERT INTO public.stock_sync_deferred
    (product_id,first_seen_at,last_attempt_at,next_attempt_at,attempts,state,last_offset,reason,message,resolved_at)
  VALUES
    (p_product_id,t,t,t+interval '30 minutes',1,'pending',p_expected_offset,'no_data',left(coalesce(p_message,''),200),NULL)
  ON CONFLICT (product_id) DO UPDATE SET
    last_attempt_at=t,
    attempts=least(3,public.stock_sync_deferred.attempts+1),
    state=CASE WHEN public.stock_sync_deferred.attempts >= 2 THEN 'exhausted' ELSE 'pending' END,
    next_attempt_at=CASE WHEN public.stock_sync_deferred.attempts >= 2 THEN NULL ELSE t+interval '60 minutes' END,
    last_offset=p_expected_offset,
    reason='no_data',
    message=left(coalesce(p_message,''),200),
    resolved_at=NULL;

  next_offset := p_expected_offset+1;
  UPDATE public.sync_progress
     SET last_offset=next_offset,
         error_count=coalesce(error_count,0)+1,
         last_sync_at=t,
         updated_at=t,
         status=CASE WHEN next_offset=p.total_products THEN 'needs_review' ELSE 'running' END,
         completed_at=NULL
   WHERE id='stock-sync' AND last_offset=p_expected_offset;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkpoint write failed; deferral rolled back'; END IF;
  RETURN next_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.defer_unverified_stock_sync_product(integer,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_unverified_stock_sync_product(integer,uuid,text,text)
  TO service_role;
