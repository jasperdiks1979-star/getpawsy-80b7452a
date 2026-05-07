# Pinterest Publish Pipeline — Repair Plan

## Root Cause (verified against the database)

Queue snapshot:

```text
status   | count | with approved_at
---------+-------+------------------
posted   |   895 | 0
skipped  |   162 | 0
draft    |   128 | 0
queued   |    86 | 0
```

All 86 `queued` pins have `approved_at = NULL`. The QA hardening added in the last loop introduced
`.not("approved_at", "is", null)` in both `pinterest-cron-worker` and `publish_next`. Result: every
queued pin is silently filtered out, hence "No queued pins ready to publish yet" while the queue
grows. The viral-batch generator now correctly inserts as `draft`, but legacy code paths
(`scale_100`, `queue_pins`, manual seeds) still insert directly as `queued` with no `approved_at`.

## Fix Scope

### 1. Strict state machine + DB hygiene (migration)

- Add columns: `pinterest_pin_queue.publishing_started_at timestamptz`, `pinterest_pin_queue.publish_attempts int default 0`, `pinterest_pin_queue.last_publish_error text`.
- Add `pinterest_publish_logs` table — one row per publish attempt with: `pin_queue_id`, `attempt`, `status` (`started`/`success`/`failed`/`skipped_duplicate`), `board_id`, `image_url`, `pin_title`, `destination_link`, `request_payload jsonb`, `response_payload jsonb`, `error_message`, `duration_ms`, `created_at`.
- Add partial index `(status, scheduled_at)` filtered on `status IN ('queued','publishing')`.
- Backfill: any row `status='queued' AND approved_at IS NULL` → `status='draft'` so it shows in review (admin can bulk-approve).

### 2. Recovery & state transitions in `pinterest-automation`

- New actions: `recover_orphaned_queued` (queued→draft when no approved_at), `clear_stuck_publishing` (publishing→queued when `publishing_started_at < now()-15min`), `force_publish` (admin override that bypasses `approved_at` check, still runs QA), `dedupe_queue` (delete duplicates by `(product_id, pin_variant)` keeping oldest), `delete_pin` (single-row purge).
- Tighten `publish_next` to return a structured diagnostic when 0 rows match: `{ok:true, ready:0, reasons:{not_approved, scheduled_in_future, missing_slug}}`.
- Tighten `approve_pin` / `bulk_approve` to set `status='queued'`, `approved_at=now()`, `scheduled_at=now()` only when QA passes (already correct).

### 3. Cron worker (`pinterest-cron-worker`)

- Lock-then-publish: before fetch loop, do `UPDATE … SET status='publishing', publishing_started_at=now() WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` to prevent races.
- Wrap each publish: insert `pinterest_publish_logs` row with `status='started'`, then update with response or error.
- Duplicate guard already present (7-day same product+variant) — extend to also check `image_hash` from previous loop's migration.
- On success: `status='posted'`, `posted_at`, `pin_external_id`. On failure under MAX_RETRIES: `status='queued'`, increment `publish_attempts`. At MAX: `status='failed'`.

### 4. Admin UI (`PinterestAutomationPage.tsx`)

- New "Publish Health" panel at top: API status (from `pinterest_connection.status`), last cron run (latest `pinterest_post_logs.action='cron_tick'`), queue depth, posted-last-24h, success rate (posted / posted+failed last 24h), avg publish duration (from new logs table), stuck-publishing count.
- New "Recovery" toolbar: buttons for the 5 new actions above, each with confirm dialog and toast feedback.
- Force-publish row action on each draft/queued pin.
- Dashboard counts now read directly from `pinterest_pin_queue` grouped by status — already correct, but add `publishing` bucket.

### 5. Live test mode

- `test_publish_now` action: takes `pinId`, bypasses scheduler, runs QA, posts, returns full Pinterest API JSON in the response. Surfaces in UI as "Test publish now" button.

## Out of scope

- TikTok automation, Google Ads, Pinterest OAuth refactor, board mapping changes, scheduler/cron schedule change. Pinterest mode (sandbox/prod) and existing rate limits stay as configured.

## Files

**New**
- `supabase/migrations/<ts>_pinterest_publish_pipeline.sql`

**Edited**
- `supabase/functions/pinterest-cron-worker/index.ts` — lock, publish logs, attempts.
- `supabase/functions/pinterest-automation/index.ts` — recovery actions, force/test publish, diagnostics.
- `src/pages/admin/PinterestAutomationPage.tsx` — health panel, recovery toolbar, per-row actions.
- `src/integrations/supabase/types.ts` — auto-regenerates after migration.

## Verification

1. After migration, confirm 86 orphaned `queued` pins moved to `draft` (visible in review).
2. Bulk-approve a small set (3) → cron tick or "Publish next now" → verify rows reach `posted` with `pin_external_id` and a row in `pinterest_publish_logs`.
3. Health panel reflects real counts; success rate updates after first run.
