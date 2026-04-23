-- Add idempotency_key column for safe deduplication of retried crawler-visit pings.
-- Nullable so legacy callers (without a key) keep working unchanged. The unique
-- index is partial (WHERE idempotency_key IS NOT NULL) so multiple keyless rows
-- can still coexist — only keyed rows are deduplicated.
ALTER TABLE public.crawler_visits
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS crawler_visits_idempotency_key_uidx
  ON public.crawler_visits (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.crawler_visits.idempotency_key IS
  'Client-supplied stable key (page-view id + render stage). Used with a partial unique index so retried log-crawler-visit calls are deduplicated rather than inserting duplicate rows.';
