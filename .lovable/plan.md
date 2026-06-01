## Goal

Stop losing concepts to HTTP 429 `queue_limit_reached`. When the render queue is full, concepts must wait in a `queue_waiting` state and get promoted automatically as slots free up, with a retry cap before manual review.

## Root cause

`cinematic-ad-queue-render` returns 429 when `>= MAX_ACTIVE_QUEUED (=5)` jobs are already in `render_queued`. The Pinterest Ad Studio frontend treats every non-OK queue response (including 429) as `concept_failed`, so 4-concept director runs frequently lose 3 of them. There is no waiting state, no staggering, and no auto-promotion when a render finishes.

## Changes

### 1. DB migration — new status + retry counter
- Add allowed status `queue_waiting` to `cinematic_ad_jobs.status` enum/check constraint.
- Add columns: `queue_wait_attempts INT DEFAULT 0`, `queue_wait_next_at TIMESTAMPTZ`, `queue_wait_reason TEXT`.
- Index `(status, queue_wait_next_at)` for the watchdog.

### 2. `cinematic-ad-queue-render/index.ts`
- When `activeQueuedCount >= MAX_ACTIVE_QUEUED`:
  - Do **not** mark the job failed.
  - Update job: `status = 'queue_waiting'`, increment `queue_wait_attempts`, set `queue_wait_next_at = now() + jitter(30–60s)`, `queue_wait_reason = 'queue_limit_reached'`.
  - Return HTTP **202** with `{ ok: true, status: 'queue_waiting', retry_after_seconds: <30–60>, attempts }` instead of `bad(429,…)`.
- Honor an upstream `Retry-After` if present; otherwise base delay on `attempts` (30s, 45s, 60s, capped).
- Add `MAX_QUEUE_WAIT_ATTEMPTS = 8`. When exceeded, set status `needs_admin_review` with `error_message = 'queue_wait_exhausted'`.
- Raise `MAX_ACTIVE_QUEUED` from 5 → 6 so a single director run (4 concepts) doesn't immediately wait when the queue is otherwise idle (keeps capacity headroom).

### 3. Staggered dispatch in `PinterestAdStudio.tsx`
- Replace `Promise.allSettled(concepts.map(...))` with sequential dispatch:
  - Concept 0: prepare + queue immediately.
  - Concepts 1..N: prepare immediately (cheap), then call `queue-render` spaced 30s apart via `setTimeout`/await delay.
- Concepts that return `status: 'queue_waiting'` render with stage `"queue_waiting"`, label **"Queued — waiting for render slot"** (not `concept_failed`).
- Concept rows are never removed; sibling jobs preserved.

### 4. UI updates (`PinterestAdStudio.tsx`)
- Extend `ConceptStage` with `"queue_waiting"`.
- Badge: secondary variant, hourglass icon, copy "Queued — waiting for render slot · retry in {n}s".
- `suggestFix` for 202/queue_waiting returns null (no fix needed).
- Treat HTTP 202 as success in `invokeWithDiag`.

### 5. Watchdog auto-promotion
- Extend `cinematic-ad-watchdog/index.ts` (already a cron entry point):
  - Every run, count active `render_queued + rendering` jobs.
  - If capacity available, pick oldest `queue_waiting` rows where `queue_wait_next_at <= now()`, call `cinematic-ad-queue-render` for them one at a time until capacity full.
  - On render webhook completion (`cinematic-ad-render-webhook`): after persisting result, fire one promotion attempt for the oldest waiting concept (best-effort, non-blocking).

### 6. End-to-end test
- New `cinematic-ad-e2e-test` scenario (or extend existing): trigger a 4-concept director run, then assert:
  - 4 jobs created.
  - 1 in `rendering`, ≥1 in `queue_waiting` (when MAX_ACTIVE_QUEUED filled by pre-existing load) **or** all 4 enter `render_queued/rendering` if capacity allows.
  - Watchdog promotes waiting → rendering on next tick.
  - Final job has non-null `output_mp4_url`, `output_file_size_bytes`, `motion_quality_score`.
  - URL has no `//`, returns `200` with `Content-Type: video/mp4` (Safari playback check already in place).

### 7. Deployment report
After deploy, run the E2E and return a markdown report:
- Before: 4 concepts → 1 success, 3 `concept_failed (429)`.
- After: 4 concepts → 1 rendering, 3 `queue_waiting` → all 4 succeed via watchdog promotion.
- Affected files listed below.

## Affected files

```text
supabase/migrations/<ts>_queue_waiting_status.sql                (new)
supabase/functions/cinematic-ad-queue-render/index.ts            (429 → 202 queue_waiting, retry counter)
supabase/functions/cinematic-ad-watchdog/index.ts                (promote oldest waiting)
supabase/functions/cinematic-ad-render-webhook/index.ts          (post-complete promotion ping)
supabase/functions/cinematic-ad-e2e-test/index.ts                (extended scenario)
src/pages/admin/PinterestAdStudio.tsx                            (sequential dispatch + queue_waiting UI)
```

## Risks

- Sequential dispatch slows perceived start time by ~90s for 4 concepts. Acceptable — concepts now actually all run.
- Watchdog promotion + webhook promotion can race; idempotent because `queue-render` re-checks capacity and `queue_waiting → render_queued` transition is atomic on a single row update.
- Raising MAX_ACTIVE_QUEUED to 6 keeps load well under render-worker ceiling.
