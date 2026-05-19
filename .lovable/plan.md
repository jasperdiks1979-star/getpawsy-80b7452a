# Pinterest Autopilot + UUID Fix

Two coordinated workstreams:

## A. UUID handling fix (do first, blocks autopilot)

The cinematic ad pipeline currently truncates `job.id` to 8 chars in some display→dispatch paths, causing `invalid input syntax for type uuid: "6d5a583b"` errors when GitHub Actions/queue-render/webhook try to look up the job.

**Audit + fix:**
- Grep for `.slice(0, 8)`, `.substring(0, 8)`, `job_id.slice`, and short-id patterns across:
  - `src/pages/admin/CinematicAdsPage.tsx`, `CinematicAdPreviewPage.tsx`, `CinematicAdsDashboardPage.tsx`
  - `supabase/functions/cinematic-ad-*` (approve, queue-render, dispatch, worker-control, autopilot, webhook, claim-job)
  - `.github/workflows/render-cinematic-ad.yml`
- Replace dispatch paths to always send the full UUID. Keep short id ONLY for display labels like `Job #6d5a583b`.
- Add UUID validation at every dispatch boundary:
  ```ts
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(jobId)) return error("Full UUID required. Do not use shortened display id.");
  ```
  Add the same regex check as a preflight step in `.github/workflows/render-cinematic-ad.yml`.
- Add a "Copy full job id" button next to short id in dashboard + preview pages.
- Verify Approve & Render MP4 button passes `job.id` (not display id) to the GitHub `workflow_dispatch` call.

## B. Pinterest Autopilot

### B1. Database (one migration)
- `pinterest_autopilot_schedule` — planned posts:
  - `scheduled_at` (US-friendly time), `product_slug`, `product_id`, `status` (planned/preparing/rendering/awaiting_publish/published/skipped/failed), `cinematic_ad_job_id` (uuid fk), `skip_reason`, `pinterest_pin_id`, `pinterest_pin_url`, `published_at`, `validation_report` (jsonb), `creative_angle`, `attempt_count`, `notes`
- `pinterest_autopilot_config` (singleton id=1): `enabled` (bool), `daily_post_target` (int default 5), `min_gap_minutes` (180), `quality_threshold` (70), `last_schedule_generated_for` (date)
- RLS: admin-only via `has_role(auth.uid(),'admin')`. Service role bypasses.
- Indexes on `(status, scheduled_at)`, `(product_id, scheduled_at)`.

### B2. Edge functions
- `pinterest-autopilot-scheduler` (cron, every 15 min):
  1. If `enabled=false`, exit.
  2. If today's schedule not generated → call generator.
  3. Find planned rows where `scheduled_at <= now()` AND status='planned' AND last published >= 3h ago AND today's published count < 5 → mark `preparing`, dispatch.
- `pinterest-autopilot-generate-schedule`:
  - Pick 4–5 US-friendly slots (randomized within 09:00, 12:00, 15:00, 19:00, 21:00 ET ± jitter), min 3h apart.
  - Select N distinct products: active, in stock, has primary image + ≥2 gallery images, valid slug, not posted in last 7 days. Score by image count, conversion fields, category strength. Insert planned rows.
- `pinterest-autopilot-run-one`:
  - Input: `schedule_id`. Calls `cinematic-ad-autopilot` with product_slug → gets `job_id`. Stores full UUID on schedule row. Sets status `rendering`. Webhook flow auto-publishes if quality passes (already implemented).
  - On failure: retry once (regenerate), else mark `skipped` with reason and unlock that slot for another product.
- `cinematic-ad-render-webhook` (extend): when auto-publish completes, update matching `pinterest_autopilot_schedule` row with pin_id, pin_url, published_at, validation_report.

### B3. Cron
Insert pg_cron job calling `pinterest-autopilot-scheduler` every 15 minutes (uses `supabase--insert` since URL+anon key are project-specific).

### B4. Admin UI: `/admin/pinterest-autopilot-daily`
Reuse the existing `/admin/pinterest-autopilot` page or add a new tab. Panels:
- Status header (ON/OFF toggle, today published X/5, next post in HH:MM)
- Today's planned table (time, product thumbnail+slug, status, pin URL, skip reason)
- Buttons: Turn On, Turn Off, Generate Today's Schedule, Run One Now, View Logs
- Logs drawer: tail `pinterest_autopilot_schedule` + linked `cinematic_ad_jobs.autopilot_log`

### B5. Quality gate
Already implemented in `cinematic-ad-render-webhook` (validation_report.passed + score≥threshold). Schedule runner only sets `auto_publish=true` for autopilot jobs and reads back result.

## Out of scope
- New Remotion compositions (viral-vertical already exists)
- New voice or creative engine (reuse `cinematic-ad-autopilot` + `creative-kit.ts`)
- Manual hook entry UI (autopilot bypasses it)

## Deliverables
1. One migration (autopilot tables + RLS).
2. One pg_cron insert.
3. Three new edge functions + extension of webhook.
4. UUID fix patch across ~6 files + workflow preflight.
5. Admin daily-autopilot panel with controls.
6. End-to-end smoke: toggle ON → generate schedule → run one now → render → validate → publish → row populated with pin URL.
