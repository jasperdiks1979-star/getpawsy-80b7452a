
# Pinterest Publish Pipeline — Full Repair Plan

## Diagnosis (confirmed against live DB)

Queue right now: **170 draft, 65 queued, 4 failed, 895 posted, 172 skipped**.

The 65 stuck queued pins all share:
- `approved_at IS NULL`
- `board_id IS NULL`
- `publish_attempts = 0`

The cron worker (`pinterest-cron-worker/index.ts` line 272) requires `approved_at IS NOT NULL`, AND restricts to `PINTEREST_ALLOWED_SLUGS` (line 273). So the cron correctly fetches 0 rows and returns "No pins due". That is the actual root cause — not a worker bug, but a missing approval step + slug allowlist mismatch with new Domination-Mode pins.

So the work splits into: (a) make the existing queue publishable, (b) tighten the state machine so this can't silently stall again, (c) give admins visibility + manual controls.

---

## Phase 1 — Unblock the existing queue (DB only)

A small migration + a runtime tweak:

1. Extend the `pinterest_pin_queue_status_check` constraint to allow `'publishing'` and `'rejected'` (current set: draft, queued, scheduled, posted, failed, paused, skipped). We keep `queued` as the canonical "ready to ship" state — no rename, no breaking changes.
2. Add `idempotency_key TEXT UNIQUE` (md5 of `product_id|image_hash|pin_title`) so duplicate-post protection has something durable to check.
3. Cron worker change: when `pinterest_runtime_settings.domination_mode = true`, **skip the `PINTEREST_ALLOWED_SLUGS` filter** (Domination Mode's whole point). Allowlist only applies in non-domination mode.
4. Cron worker change: stop requiring `approved_at IS NOT NULL` when `pinterest_runtime_settings.auto_approve_queue = true` (new bool column, default `false`). Admin can flip it on for the current backlog and back off afterwards. We do NOT silently auto-approve — the admin opts in.

## Phase 2 — Strict state machine + locking

In `pinterest-cron-worker/index.ts`:

- Replace the current "set status=publishing then update" pattern with an **atomic claim**: `UPDATE … SET status='publishing', publishing_started_at=now(), publish_attempts=publish_attempts+1 WHERE id=ANY($claimed) AND status='queued' RETURNING *`. Any row not returned was claimed by a parallel run — skip it.
- After Pinterest API call:
  - success → `status='posted', posted_at=now(), pinterest_pin_id=…, external_url=…`
  - failure → if `publish_attempts >= MAX_RETRIES` then `status='failed'`, else back to `status='queued'` with `last_publish_error` set and `scheduled_at = now() + backoff`.
- Add a **stale-publishing reaper** at the top of every cron tick: any row stuck in `status='publishing'` with `publishing_started_at < now() - interval '10 minutes'` is reset to `queued` (or `failed` if attempts exhausted).

## Phase 3 — Force-publish & test endpoints

New edge function `pinterest-publish-now` (POST, admin-auth via `requireAdmin`) with two modes:
- `{ mode: "next" }` — claim the single oldest eligible queued pin and publish it inline, returning the full Pinterest API response.
- `{ mode: "pin", pinId: "<uuid>" }` — bypass eligibility filters entirely (still respects duplicate-post check), publish that specific pin, return full API response.

Both reuse the same `publishOnePin()` helper that the cron worker uses, so behavior is identical.

## Phase 4 — Real publish logging

`pinterest_publish_logs` already exists (FK from queue). Standardize what we write per attempt:

```
{ pin_queue_id, attempt_number, board_id, image_url, title, description,
  destination_url, request_payload, response_status, response_body,
  pinterest_pin_id, error_message, duration_ms, created_at }
```

Logged from `publishOnePin()` so cron + force-publish + test-publish all populate it identically.

## Phase 5 — Duplicate guard

Before each publish call:
- if `pinterest_pin_id IS NOT NULL` → mark `posted` and skip (already published).
- if any row in last 7 days has the same `idempotency_key` and `status='posted'` → mark current row `skipped` with reason `duplicate`.

## Phase 6 — Admin Health + Recovery panel

New component `PinterestPublishHealthCard.tsx` mounted on the existing Pinterest admin page. Reads via short SQL aggregates (RPC `pinterest_publish_health`):

- API status (uses existing connection check)
- Queue depth by status (live counts)
- Last cron run time + success rate (from `cron_job_logs` + `pinterest_publish_logs`)
- Avg publish duration (last 50)
- Buttons:
  - **Publish next now** → calls `pinterest-publish-now` mode=next
  - **Test publish a pin** → pin picker → mode=pin
  - **Approve all queued** → sets `approved_at=now()` on all `queued` rows missing it
  - **Reset stuck publishing** → reaper SQL on demand
  - **Retry failed** → moves `failed` (with attempts < cap) back to `queued`
  - **Clear duplicate queue items** → keeps oldest per `idempotency_key`

## Files

**New**
- `supabase/functions/pinterest-publish-now/index.ts`
- `supabase/functions/_shared/pinterest-publish-core.ts` (extracted `publishOnePin`)
- `src/components/admin/PinterestPublishHealthCard.tsx`
- DB migration: status check + new columns + RPC

**Edited**
- `supabase/functions/pinterest-cron-worker/index.ts` (atomic claim, reaper, domination/auto_approve gate, calls shared `publishOnePin`)
- `supabase/config.toml` (register `pinterest-publish-now`)
- The existing Pinterest admin page (mount the health card)

**Untouched**
- `pinterest-viral-batch`, `pinterest-templates.ts`, `pinterest-image-scrub.ts`, `pinterest-preview-styles`, OAuth flow, board mapping, US-score, warm-up cap.

## Out of scope for this round
- Renaming `status='queued'` → `'approved'+'queued'` split (the user's strict 7-state machine). We keep current 7 statuses + add `publishing`/`rejected`; the strict transition rules are enforced in code, not via two separate "approved" and "queued" rows.
- New cron schedule changes — current 4-pins/day cap and 90-min gap stay.

## Verification
1. Run migration → confirm `publishing` allowed.
2. Hit "Approve all queued" → 65 rows get `approved_at`.
3. Hit "Publish next now" → expect a real Pinterest pin ID in the response and `status='posted'` on that row.
4. Wait one cron tick → posted count should climb; queued count should drop.
5. Open the health card → live counts reflect DB.
