\\set ON_ERROR_STOP on
-- Throwaway PostgreSQL integration harness ONLY. Never run against production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  cj_product_id text,
  stock integer NOT NULL
);
INSERT INTO public.products(id,cj_product_id,stock) VALUES
('00000000-0000-0000-0000-000000000001','cj-1',42),
('00000000-0000-0000-0000-000000000002','cj-2',43),
('00000000-0000-0000-0000-000000000003','cj-3',44);
CREATE TABLE public.sync_progress (
  id text PRIMARY KEY,
  status text NOT NULL,
  last_offset integer NOT NULL,
  total_products integer NOT NULL,
  synced_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz
);
INSERT INTO public.sync_progress(id,status,last_offset,total_products,synced_count,error_count)
VALUES ('stock-sync','running',0,3,0,0);
\\ir ../supabase/migrations/20261102181000_stock_sync_deferred_queue.sql
DO $$
DECLARE n integer;
BEGIN
  IF has_function_privilege('anon','public.defer_unverified_stock_sync_product(integer,uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.defer_unverified_stock_sync_product(integer,uuid,text,text)','EXECUTE')
    OR has_table_privilege('anon','public.stock_sync_deferred','SELECT') THEN
    RAISE EXCEPTION 'Deferral exposed to non-service roles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','anon',true);
  BEGIN
    PERFORM public.defer_unverified_stock_sync_product(0,'00000000-0000-0000-0000-000000000001','no_data','empty');
    RAISE EXCEPTION 'Unauthorized deferral accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  BEGIN
    PERFORM public.defer_unverified_stock_sync_product(0,'00000000-0000-0000-0000-000000000002','no_data','wrong id');
    RAISE EXCEPTION 'Wrong product accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Wrong product accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.defer_unverified_stock_sync_product(0,'00000000-0000-0000-0000-000000000001','error','not no_data');
    RAISE EXCEPTION 'Generic supplier error incorrectly deferred';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Generic supplier error incorrectly deferred' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.stock_sync_deferred;
  IF n<>0 THEN RAISE EXCEPTION 'Invalid attempt wrote deferred queue'; END IF;
  IF public.defer_unverified_stock_sync_product(0,'00000000-0000-0000-0000-000000000001','no_data','empty')<>1 THEN
    RAISE EXCEPTION 'First cursor did not advance';
  END IF;
  BEGIN
    PERFORM public.defer_unverified_stock_sync_product(0,'00000000-0000-0000-0000-000000000001','no_data','replay');
    RAISE EXCEPTION 'Replay accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Replay accepted' THEN RAISE; END IF;
  END;
  IF public.defer_unverified_stock_sync_product(1,'00000000-0000-0000-0000-000000000002','no_data','empty')<>2 THEN
    RAISE EXCEPTION 'Second cursor did not advance';
  END IF;
  IF public.defer_unverified_stock_sync_product(2,'00000000-0000-0000-0000-000000000003','no_data','empty')<>3 THEN
    RAISE EXCEPTION 'Last cursor did not advance';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sync_progress
    WHERE id='stock-sync' AND last_offset=3 AND synced_count=0
      AND error_count=3 AND status='needs_review' AND completed_at IS NULL
  ) THEN RAISE EXCEPTION 'Deferred products falsely marked verified/completed'; END IF;
  SELECT count(*) INTO n FROM public.stock_sync_deferred WHERE state='pending' AND attempts=1;
  IF n<>3 THEN RAISE EXCEPTION 'Expected three pending deferred records, got %',n; END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE stock NOT IN (42,43,44)) THEN
    RAISE EXCEPTION 'Unverified stock changed product quantities';
  END IF;
END $$;
