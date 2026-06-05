DROP INDEX IF EXISTS public.pinterest_pin_queue_idem_key_uniq;
ALTER TABLE public.pinterest_pin_queue ADD CONSTRAINT pinterest_pin_queue_idem_key_uniq UNIQUE (idempotency_key);