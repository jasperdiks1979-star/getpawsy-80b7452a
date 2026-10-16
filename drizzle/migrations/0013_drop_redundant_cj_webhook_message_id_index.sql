SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
-- Redundant: cj_webhook_logs_message_id_key (UNIQUE, backs the constraint) covers message_id.
-- Restore if ever needed: CREATE INDEX CONCURRENTLY idx_cj_webhook_logs_message_id ON public.cj_webhook_logs USING btree (message_id);
DROP INDEX IF EXISTS public.idx_cj_webhook_logs_message_id;