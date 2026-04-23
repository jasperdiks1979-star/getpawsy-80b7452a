-- Enforce one logical shell event and one terminal (rendered|timeout)
-- event per (slug, page-view-id) on crawler_visits.
--
-- Background
-- ----------
-- The PDP render-trace hook (`usePdpBotRenderTrace`) writes a stable
-- `idempotency_key` of the form `pdp:<page-view-id>:<slug>:<state>` for every
-- shell / rendered / timeout ping. The existing `crawler_visits_idempotency_key_uidx`
-- already prevents byte-identical retries from creating duplicate rows.
--
-- The two partial unique indexes below add a stronger semantic guarantee on
-- top of that: for a given (page-view-id, slug) pair, there can be AT MOST
--   * one row with state = `shell`
--   * one row with state in {`rendered`, `timeout`}  (the terminal states)
--
-- Why two indexes instead of one
-- ------------------------------
-- A single shell ping is always the first event in the lifecycle, and exactly
-- one terminal event closes it. A `rendered` ping and a `timeout` ping for
-- the same page view + slug would indicate a watchdog race — we want the DB
-- to reject the second one rather than silently accepting both.
--
-- Why partial + LIKE
-- ------------------
-- Postgres B-tree indexes can match prefix patterns. We use a `LIKE` predicate
-- on `idempotency_key` so the index only covers PDP render-trace rows; other
-- crawler-visit pings (page views, shopping crawls, etc.) keep using the
-- existing global uniqueness constraint and are unaffected.

-- Drop & recreate guards so re-running the migration is safe.
DROP INDEX IF EXISTS public.crawler_visits_pdp_shell_uidx;
DROP INDEX IF EXISTS public.crawler_visits_pdp_terminal_uidx;

-- One shell row per (page-view-id, slug).
-- Key shape: `pdp:<page-view-id>:<slug>:shell`
CREATE UNIQUE INDEX crawler_visits_pdp_shell_uidx
  ON public.crawler_visits (idempotency_key)
  WHERE idempotency_key LIKE 'pdp:%:shell';

-- One terminal row per (page-view-id, slug). We achieve this by indexing the
-- substring of the key that strips the trailing state suffix, so `pdp:X:Y:rendered`
-- and `pdp:X:Y:timeout` collide on insert.
CREATE UNIQUE INDEX crawler_visits_pdp_terminal_uidx
  ON public.crawler_visits ((regexp_replace(idempotency_key, ':(rendered|timeout)$', '')))
  WHERE idempotency_key LIKE 'pdp:%:rendered'
     OR idempotency_key LIKE 'pdp:%:timeout';

COMMENT ON INDEX public.crawler_visits_pdp_shell_uidx IS
  'Enforces at most one PDP render-trace shell event per (page-view-id, slug). Key format: pdp:<page-view-id>:<slug>:shell.';

COMMENT ON INDEX public.crawler_visits_pdp_terminal_uidx IS
  'Enforces at most one PDP render-trace terminal event (rendered|timeout) per (page-view-id, slug). Strips the :rendered/:timeout suffix so the two states collide.';