
# Cinematic Ads + Pinterest Pipeline — Operational Fix

This builds on what's already shipped (System Truth Panel, archive-stale, job-verify, heartbeat tables, safe-mode worker, host check). It fills the remaining gaps you listed without rewriting working code.

Storefront, TikTok, Merchant feed, SEO, product URLs: **untouched**.

## What already works (verified in code)
- `render-worker/start.mjs` — env validation, host pin to `nojvgfbcjgipjxpfatmm.supabase.co`, safe-mode, health server on `PORT`, heartbeat upserts to `cinematic_worker_heartbeats` + `render_worker_heartbeats`, claim → render → exit-code retry, structured logs, no crash loop.
- Health endpoints on the worker: `/health`, `/health/worker`, `/health/supabase`, `/debug/runtime`.
- Edge fns: `cinematic-ad-claim-job`, `cinematic-ad-autopublish`, `cinematic-ads-archive-stale`, `cinematic-job-verify`, `cinematic-system-truth`.
- Admin UI: `/admin/cinematic-ads` Control Center + `SystemTruthPanel`.

## Gaps to close in this pass

### 1. `cinematic-ad-worker-control` edge function (single endpoint, action-routed)
File: `supabase/functions/cinematic-ad-worker-control/index.ts` (extend, do not replace).
Admin-only via `has_role(auth.uid(),'admin')`. Returns `{ success, status, message, details, timestamp }` on every path.

Actions:
- `debug_panel` — aggregates: worker heartbeat row, queue counts per status, last 10 jobs, last error, secret presence map (masked), supabase host, expected host.
- `validate_secrets` — checks env presence for: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RENDER_WORKER_SECRET`, `PINTEREST_ACCESS_TOKEN`, `PINTEREST_BOARD_ID`, `PUBLIC_SITE_URL`. Returns `{name, present, masked}` only — never values.
- `test_pinterest` — `GET /v5/user_account` with stored token, returns username + status, never the token.
- `test_supabase` — `select count(*) from cinematic_ad_jobs` round-trip.
- `queue_test_job` — inserts a `render_queued` job with `product_slug='automatic-cat-litter-box-self-cleaning-app-control'`, `hook_variant='diagnostic'`, returns `job_id`.
- `process_once` — bumps `force_claim_at` so worker picks up next tick; does NOT spawn ffmpeg (worker owns rendering).
- `health_proxy` — fetches worker `/health/worker` server-side (worker URL stored in `cinematic_ad_settings.worker_health_url`) so the admin UI doesn't need CORS to Render.

### 2. Job schema completeness (idempotent migration)
Add only the columns that don't already exist on `cinematic_ad_jobs`:
`render_started_at, render_finished_at, pin_started_at, pin_finished_at, hook_variant, vo_url, output_mp4_url, pinterest_pin_url, error_message, retry_count, render_worker_id, product_url`.
Add `cinematic_ad_settings.worker_health_url text`.
RLS unchanged. No data migration.

### 3. Status normalization
Server-side enum-like check trigger that maps any inbound status to one of:
`queued | preparing | rendering | rendered | uploading | ready_to_pin | pinning | pinned | failed | failed_pinterest | archived`.
Backwards compat: existing values like `render_queued` mapped to `queued` via view alias only — DB rows untouched.

### 4. Pinterest publish isolation
Update `cinematic-ad-autopublish`:
- Only act on jobs where `output_mp4_url IS NOT NULL` and `status='ready_to_pin'`.
- Set `pin_started_at` before API call, `pin_finished_at` + `pinterest_pin_url` on success.
- On failure: set `status='failed_pinterest'`, populate `error_message`, never roll back render state.
- Hard guard: reject any URL containing `cjdrop`, `cjaffiliate`, or non-`getpawsy.pet` host. Forces destination to `https://getpawsy.pet/products/{slug}`.

### 5. Admin UI — `/admin/cinematic-ads`
Extend existing page (don't fork):
- Buttons row above the queue table: Queue test job, Retry failed, Run worker health check, Validate secrets, Test Pinterest, Test Supabase, Process once.
- Per-job row: `product_slug | status | retry_count | output_mp4_url (link) | pinterest_pin_url (link) | last error`.
- Each button calls `cinematic-ad-worker-control` with the matching action and toasts the `message`. Errors render the `details` JSON in a collapsible.

### 6. Render compatibility
`render-worker/package.json`: pin `"engines": { "node": ">=20 <23" }` to dodge the Node 24 break. No code changes.

### 7. Static safety routes
`public/api/health/worker` already exists as a JSON safety fallback — leave it. The admin UI calls the **edge function** `health_proxy` action, not the static route, so it always reflects live worker state.

## Files to touch
- `supabase/functions/cinematic-ad-worker-control/index.ts` (extend, add actions)
- `supabase/migrations/<ts>_cinematic_pipeline_completion.sql` (additive columns + settings col)
- `supabase/functions/cinematic-ad-autopublish/index.ts` (publish isolation + URL guard)
- `src/pages/admin/CinematicAdsControlCenterPage.tsx` (add operator buttons + per-job columns)
- `render-worker/package.json` (engines pin)

## Explicit non-goals (this pass)
- No new render engine or Remotion changes — current render path stays.
- No remote Pinterest delete — only verify + status correction.
- No worker process changes besides engines pin.
- No storefront, TikTok, GMC, SEO touches.

## Acceptance (will verify before reporting done)
1. `GET /api/health/worker` (proxied via edge fn) returns live worker JSON with `lastHeartbeatAt` < 90s.
2. `/admin/cinematic-ads` renders all operator buttons; each action returns the standard envelope.
3. `validate_secrets` reports presence for all 6 envs without leaking values.
4. `queue_test_job` → row appears `queued` → worker claims → status moves to `rendering` → terminal `rendered` or `failed` with `error_message`.
5. `test_pinterest` returns the connected account username.
6. Migration applies cleanly; types regenerate.

Ready to execute on approval.
