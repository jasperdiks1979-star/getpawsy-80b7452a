-- Additive worker state. No scheduler activation or product updates.
ALTER TABLE public.stock_sync_deferred ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.stock_sync_deferred ADD COLUMN IF NOT EXISTS lease_until timestamptz;
CREATE TABLE IF NOT EXISTS public.stock_deferred_worker_gate (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), next_call_at timestamptz NOT NULL
);
ALTER TABLE public.stock_deferred_worker_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_deferred_worker_gate FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_deferred_stock_retry()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.stock_sync_deferred%ROWTYPE; t timestamptz:=clock_timestamp(); tok uuid:=gen_random_uuid(); cj text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.stock_deferred_worker_gate VALUES(true,'-infinity') ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.stock_deferred_worker_gate WHERE id FOR UPDATE;
 t:=clock_timestamp();
 IF (SELECT next_call_at FROM public.stock_deferred_worker_gate WHERE id)>t THEN RETURN NULL; END IF;
 -- An interrupted final attempt must not silently receive a new budget.
 UPDATE public.stock_sync_deferred SET state='exhausted',next_attempt_at=NULL,lease_token=NULL,lease_until=NULL
 WHERE state='pending' AND attempts>=3 AND coalesce(lease_until,'-infinity')<=t;
 SELECT * INTO q FROM public.stock_sync_deferred WHERE state='pending' AND attempts<3
 AND next_attempt_at<=t AND coalesce(lease_until,'-infinity')<=t
 ORDER BY next_attempt_at,product_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT cj_product_id INTO cj FROM public.products WHERE id=q.product_id;
 IF cj IS NULL THEN
  UPDATE public.stock_sync_deferred SET state='exhausted',next_attempt_at=NULL,message='CJ mapping missing' WHERE product_id=q.product_id;
  RETURN NULL;
 END IF;
 UPDATE public.stock_sync_deferred SET attempts=attempts+1,last_attempt_at=t,lease_token=tok,
 lease_until=t+interval '5 minutes',next_attempt_at=t+make_interval(mins=>30*(2^q.attempts)::integer)
 WHERE product_id=q.product_id;
 -- One outstanding worker request globally. Expiry enables crash recovery.
 UPDATE public.stock_deferred_worker_gate SET next_call_at=t+interval '5 minutes' WHERE id;
 RETURN jsonb_build_object('product_id',q.product_id,'cj_product_id',cj,'token',tok);
END $$;

CREATE OR REPLACE FUNCTION public.finish_deferred_stock_retry(p_id uuid,p_token uuid,p_cj text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.stock_sync_deferred%ROWTYPE; t timestamptz:=clock_timestamp(); n integer; w text; s text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.stock_deferred_worker_gate WHERE id FOR UPDATE;
 SELECT * INTO q FROM public.stock_sync_deferred WHERE product_id=p_id FOR UPDATE;
 t:=clock_timestamp();
 IF NOT FOUND OR q.state<>'pending' OR q.lease_token IS DISTINCT FROM p_token OR p_token IS NULL OR q.lease_until<=t THEN RETURN false; END IF;
 s:=p_result->>'status'; w:=p_result->>'warehouse';
 IF p_result->'confirmed'='true'::jsonb AND s IN ('ok','discontinued')
 AND (p_result->>'stock') ~ '^[0-9]+$' AND w IN ('US','EU','CN','none') THEN
  n:=(p_result->>'stock')::integer;
  IF s='discontinued' AND n<>0 THEN RAISE EXCEPTION 'Invalid discontinued stock'; END IF;
  UPDATE public.products SET stock=n,
   us_stock=CASE WHEN w='US' THEN n WHEN s='discontinued' OR w='none' THEN 0 ELSE us_stock END,
   eu_stock=CASE WHEN w='EU' THEN n WHEN s='discontinued' OR w='none' THEN 0 ELSE eu_stock END,
   cn_stock=CASE WHEN w='CN' THEN n WHEN s='discontinued' OR w='none' THEN 0 ELSE cn_stock END,
   stock_sync_status=s,stock_sync_error=NULL,last_stock_sync_at=t,stock_source='CJ',supplier_warehouse=w,updated_at=t
  WHERE id=p_id AND cj_product_id=p_cj AND (last_stock_sync_at IS NULL OR last_stock_sync_at<=q.last_attempt_at);
  IF NOT FOUND THEN RAISE EXCEPTION 'Product mapping or stock observation changed'; END IF;
  UPDATE public.stock_sync_deferred SET state='resolved',resolved_at=t,next_attempt_at=NULL,lease_token=NULL,lease_until=NULL WHERE product_id=p_id;
 ELSE
  UPDATE public.stock_sync_deferred SET state=CASE WHEN attempts>=3 THEN 'exhausted' ELSE 'pending' END,
   next_attempt_at=CASE WHEN attempts>=3 THEN NULL ELSE next_attempt_at END,
   message=left(coalesce(p_result->>'message','Unverified supplier response'),200),lease_token=NULL,lease_until=NULL WHERE product_id=p_id;
 END IF;
 -- Keep scan counters conservative: resolving a queue item is not a full scan.
 UPDATE public.stock_deferred_worker_gate SET next_call_at=t+interval '30 seconds' WHERE id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_deferred_stock_retry() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_deferred_stock_retry(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_deferred_stock_retry() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_deferred_stock_retry(uuid,uuid,text,jsonb) TO service_role;

-- A new scan deferral supersedes an outstanding observation of that incident.
CREATE OR REPLACE FUNCTION public.invalidate_deferred_stock_lease()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.last_attempt_at IS DISTINCT FROM OLD.last_attempt_at
 AND NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token THEN
  NEW.lease_token:=NULL; NEW.lease_until:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invalidate_deferred_stock_lease ON public.stock_sync_deferred;
CREATE TRIGGER invalidate_deferred_stock_lease BEFORE UPDATE ON public.stock_sync_deferred
FOR EACH ROW EXECUTE FUNCTION public.invalidate_deferred_stock_lease();
REVOKE ALL ON FUNCTION public.invalidate_deferred_stock_lease() FROM PUBLIC,anon,authenticated;
