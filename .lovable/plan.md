# Cinematic Ads Recovery Plan

## Production reality (verified just now)
- 36 failures: `timeline_invalid: scene_count_invalid(0<3)` — storyboard returns 0 scenes, validator hard-fails instead of regenerating.
- 2 failures: HTML response parsed as JSON (`Unexpected token '<'`).
- 1 historical failure: GitHub `workflow_dispatch` missing — **already fixed in `.github/workflows/render-cinematic-ad.yml`** (trigger present on line 3). Will add a runtime preflight before dispatch so this can never regress silently.
- Stuck jobs right now: 4 `preparing`, 4 `prepared`, 1 `render_queued`, 1 `needs_scene_regen`. `cinematic-ad-watchdog` exists (747 lines) but is not auto-advancing these states.

## Scope (what I will build)

### 1. Scene generation never returns 0 (`cinematic-ad-storyboard` + new helper)
- After storyboard call, if `scenes.length < 3`: retry up to 5 times with mutated prompt seed (varied hook tone, beat reshuffle, temperature bump).
- If still `< 3`: image-only fallback — synthesize 3 minimum scenes from product hero / detail / lifestyle images (Ken-Burns-safe specs, marked `fallback_source: 'product_images'`).
- Set `status='needs_scene_regen'` only if both AI retries AND image fallback fail (should be near-zero).
- Validator (`cinematic-ad-validate`) updated: instead of failing `scene_count_invalid`, it sets `status='needs_scene_regen'` so the regen loop runs once more before terminal fail.

### 2. HTML / non-JSON response guard (shared helper inlined in storyboard + push-pinterest)
- Wrap every upstream `fetch` (Lovable AI Gateway, Pinterest, GitHub) in `safeJsonFetch()`:
  - If `content-type` is not `application/json` OR body starts with `<`, log endpoint + first 200 chars, throw `non_json_response` (caught by retry loop, not crash).

### 3. Watchdog auto-advance (`cinematic-ad-watchdog`)
- Every run (already cron-driven every 60s): scan `cinematic_ad_jobs` and:
  - `prepared` → call `cinematic-ad-queue-render` → `render_queued`.
  - `render_queued` older than 2 min with no `render_dispatched_at` → call `cinematic-ad-dispatch` (GitHub).
  - `preparing` > 15 min → reset to `pending` with `smart_retry_count += 1` (cap 5).
  - `render_queued` > 30 min → re-dispatch (cap 5).
  - At cap: mark `failed` with `recoverable=false`.
- Add GitHub dispatch preflight: `GET /repos/.../actions/workflows/render-cinematic-ad.yml` and verify `state=active` before queueing.

### 4. Admin dashboard (`/admin/cinematic-health`)
New page reading from existing tables. Live cards:
- Pipeline Health: counts by status (7d), failure rate, recoverable %.
- Scene Generator Health: avg scene_count, % needing fallback, retry distribution.
- Render Queue Health: oldest `render_queued`, stuck count, worker heartbeat age.
- GitHub Dispatch Health: last successful dispatch, workflow_dispatch preflight status, last 422.
- Pinterest Publisher Health: published 24h, last publish error.
Auto-refresh every 30s. Lazy-loaded route.

## Out of scope (intentional)
- No DB schema changes (all columns needed already exist: `smart_retry_count`, `render_attempts`, `render_heartbeat_at`, `recoverable`, etc.).
- No changes to Remotion render code or v5/v7 quality scoring.
- No changes to Pinterest publishing logic — only the response-guard wrapper.
- No new cron jobs (watchdog cron already runs every 60s; verified during last sprint).

## Files
**Edit:** `supabase/functions/cinematic-ad-storyboard/index.ts`, `supabase/functions/cinematic-ad-validate/index.ts`, `supabase/functions/cinematic-ad-watchdog/index.ts`, `supabase/functions/cinematic-ad-push-pinterest/index.ts`, `src/App.tsx`.
**Create:** `supabase/functions/cinematic-ad-storyboard/sceneFallback.ts` (inline helper section), `src/pages/admin/CinematicHealthPage.tsx`.

## Risk
- Image-fallback scenes will be visually weaker than AI storyboard; they still pass through v5/v7 validators so quality gates remain in force — fallback may be rejected and routed to `needs_scene_regen`, which is correct behavior (better than hard-fail).
- Watchdog auto-advance may surface latent bugs in `cinematic-ad-queue-render` for jobs that were never meant to render; preflight + recoverable flag protects against runaway.

Confirm and I'll implement all four blocks in one pass, then deploy the 4 edge functions and verify against the 4 currently-stuck jobs.