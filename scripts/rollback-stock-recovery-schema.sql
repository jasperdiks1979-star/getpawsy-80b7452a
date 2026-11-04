-- Only for the additive schema deployment, before any worker activation.
-- Refuse removal once a recovery/deferred record exists; never erase queue state.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.stock_sync_deferred, public.stock_sync_recovery_leases IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.stock_sync_deferred)
 OR EXISTS (SELECT 1 FROM public.stock_sync_recovery_leases) THEN
   RAISE EXCEPTION 'Recovery data exists; preserve schema and disable worker instead';
 END IF;
END $$;
DROP FUNCTION public.defer_unverified_stock_sync_product(integer,uuid,text,text);
DROP FUNCTION public.claim_stalled_stock_sync_recovery(integer);
DROP TABLE public.stock_sync_deferred;
DROP TABLE public.stock_sync_recovery_leases;
COMMIT;
