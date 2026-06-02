## Goal
A normal admin director run completes with at least one real motion-engine MP4, or fails with an exact, unambiguous reason. No silent queues, no fake success, no misleading errors.

## Scope of changes

### 1. Compliance sanitizer (shared module)
- New `supabase/functions/_shared/complianceSanitizer.ts` with `sanitizeMarketingCopyForCompliance(text)` and `sanitizeCreativeBundle(plan)`.
- Replacement map: `heal/healing/heals → comfort/soothe`, `cure/cured → help/ease`, `treat/treatment → support`, `pain/anxiety relief → calmer routine / more comfort`, `medical/therapeutic → supportive`, `vet-approved → trusted by pet parents`.
- Returns `{ text, replacements:[{from,to,field}] }` for logging.
- Applied in `cinematic-ad-plan`, `cinematic-ad-storyboard`, `cinematic-ad-prepare`, and again as a final guard inside `cinematic-ad-preflight` and `cinematic-ad-queue-render` (defense in depth).
- Mirror in `src/lib/complianceSanitizer.ts` so the UI can pre-sanitize before regen.

### 2. Preflight override pipeline
- `cinematic-ad-preflight`: when `force_preflight_override=true` AND caller is admin/director, drop only `product_out_of_stock` and `product_inactive` from `fail_reasons`. All other gates remain hard.
- `cinematic-ad-queue-render`: read `force_preflight_override` from the job row (persisted by prepare) and pass it into `ensureRenderReady` so the same bypass applies. Add explicit log line `[queue-render] override_applied=true reasons_after_override=[...]`.
- If only remaining reasons are bypassable → continue. Else 412 with full `fail_reasons` array.
- Banned copy: queue-render runs sanitizer one more time; if banned terms remain after sanitize, returns 412 `banned_copy_after_sanitize` with the offending fields — concept_failed, no infinite retry.

### 3. Accurate error mapping (UI)
- `src/pages/admin/PinterestAdStudio.tsx`: replace any `"Voice synthesis failed"` string with a mapper:
  - `product_out_of_stock` → "Out of stock. Enable preflight override for test renders or restock."
  - `banned_copy:*` → "Compliance copy blocked: `<term>`. Regenerate to sanitize."
  - `not_render_ready` → "Preparation gate failed: `<reasons>`."
  - `worker_secret_mismatch` / 401 → "Render worker secret mismatch. Rotate RENDER_WORKER_SECRET in both GitHub and backend."
  - 429 → "Render budget exhausted. Enable budget override."
  - timeout/network → "Retryable network issue."
- Voiceover label only shows `voiceover_failed` when `vo_url` is null AND there's a real voice error. Otherwise show "Voice-over OK".
- Show response body verbatim in an expandable diagnostics panel.

### 4. Queue/state machine
- Step 4 only renders "In queue" cards for jobs whose DB row currently has `status ∈ {render_queued, rendering}`.
- Dry-run: Step 4 shows diagnostics-only, no queue cards at all.
- Client watchdog (already at 8min):
  - `render_queued > 10min` without `render_worker_id` → set `status=needs_admin_review`, `admin_review_reason=stale_render_queued`, show Retry / Release slot.
  - `rendering > 20min` without heartbeat → `failed`, `error_code=worker_stalled`.
  - `heartbeat older than 10min` → `failed`, `error_code=heartbeat_lost`.
- Every transition writes `status_message`.

### 5. Worker secret handshake
- New edge function `cinematic-ad-secret-healthcheck`: validates GitHub→Supabase by accepting a `x-render-worker-secret` header and comparing to the env value; returns `{ok:true}` or 401 `worker_secret_mismatch`.
- `cinematic-ad-claim-job`: on header mismatch, return 401 with code `worker_secret_mismatch`; do not flip job to rendering.
- Admin "Secret health check" button in Pinterest Ad Studio diagnostics — invokes the new function with a sentinel and surfaces ok/fail.
- New GitHub workflow step (`Preflight secret handshake`) calls `cinematic-ad-secret-healthcheck` before the render step. If 401, job is updated to `needs_admin_review` with reason `worker_secret_mismatch` and workflow exits with explicit message.

### 6. GitHub Actions / render-worker
- `.github/workflows/render-cinematic-ad.yml` already passes `RENDER_WORKER_SECRET`. Add the handshake step described above.
- `remotion/scripts/render-cinematic-ad.mjs`: immediately after `claim-job` success, POST to `cinematic-ad-render-webhook` with `{stage:'started', render_worker_id, render_started_at:nowISO}` and start a heartbeat interval (every 60s) that POSTs `{stage:'heartbeat', render_heartbeat_at:nowISO}`. On fatal error, POST `{stage:'failed', error_code, error_message, traceId}` before exit. Never silent-exit.
- If motion-engine required and fails → `error_code=REMOTION_RENDER_FAILED`, no Ken Burns fallback, no MP4 upload.

### 7. Motion engine enforcement (v3+)
- In `cinematic-ad-plan` / `cinematic-ad-storyboard`: validate `motion_storyboard` has ≥6 scenes, `motion_ratio≥0.7`, `camera_diversity≥3`, `transition_count≥3`. If not, fail with `MOTION_ENGINE_FAILED`.
- Webhook persists `render_mode, motion_engine_used, motion_score, motion_diversity, transition_count, engine_version, final_mp4_url, validation_passed`.
- Autopublish gate adds: `final_mp4_url AND validation_passed AND motion_score>=0.5 AND render_mode!='standard'`.

### 8. Product/inventory UI
- Show `stock`, `is_active`, last `preflight_status`, last `preflight_reasons` for the selected product in Step 1.
- If `stock=0`, banner: "Product is out of stock. For test renders enable preflight override; for publish/ads restock first."
- Publishing path keeps a separate `force_publish_override` flag — preflight override alone does NOT permit publish of an OOS product.

### 9. Per-concept resilience
- Director dispatcher already maps 4 concepts in parallel; ensure each is wrapped in try/catch so one failure does not throw at `Promise.all` level (switch to `Promise.allSettled`).
- UI badge "X/4 ok, Y failed". First successful `output_mp4_url` becomes Step 4 preview.

### 10. Retry behavior
- "Regen" creates a fresh `cinematic_ad_jobs` row (new id), fresh plan, runs sanitizer, copies forward `force_preflight_override` and `force_render_budget_override`.
- Never reuses the prior banned copy: when reusing seed prompt for regen, strip cached banned terms first.

### 11. UI Debug Director per-concept ladder
- Per concept show: prepare / plan / preflight / queue-render / claim / render / webhook / final, each with badge + last `status_message`.
- "Copy diagnostics" button copies a JSON blob with: job_id, product_slug, status, status_message, fail_reasons, traceIds, render_worker_id, render_started_at, render_heartbeat_at, render_complete_at, final_mp4_url, engine_version, motion_score.
- Mobile-safe layout (stack on <640px, sticky action bar with `pb-[env(safe-area-inset-bottom)]`).

### 12. Tests
Add Deno tests under `supabase/functions/_tests/` for:
1. Sanitizer rewrites "heal" → "comfort" across nested plan fields.
2. Banned copy surviving sanitizer → `concept_failed`.
3. Preflight OOS without override → 412.
4. Preflight OOS with admin override → ok.
5. queue-render inherits `force_preflight_override`.
6. 401 claim mismatch → `worker_secret_mismatch`, no `render_queued` lock.
7. 429 with budget override → ok.
8. dry-run never inserts queue rows.
9. v3 engine never returns `render_mode=standard`.
10. Promise.allSettled keeps siblings alive.
11. Publish blocked when stock=0 and no `force_publish_override`.

### 13. Final validation (run after deploy)
- 1 dry-run on a selected product → expect diagnostics-only Step 4.
- 1 real director test with both overrides on → expect ≥1 concept reaching `render_queued`, GitHub Action starts, `render_started_at` + `render_heartbeat_at` written, then either `render_complete_at` with MP4 or explicit `error_code`.
- Report job IDs + final statuses in chat.

## Files touched (approx)
- New: `supabase/functions/_shared/complianceSanitizer.ts`, `supabase/functions/cinematic-ad-secret-healthcheck/index.ts`, `src/lib/complianceSanitizer.ts`, `supabase/functions/_tests/*`.
- Edited: `cinematic-ad-plan`, `cinematic-ad-storyboard`, `cinematic-ad-prepare`, `cinematic-ad-preflight`, `cinematic-ad-queue-render`, `cinematic-ad-claim-job`, `cinematic-ad-render-webhook`, `cinematic-ad-autopublish`.
- Edited: `.github/workflows/render-cinematic-ad.yml`, `remotion/scripts/render-cinematic-ad.mjs`.
- Edited: `src/pages/admin/PinterestAdStudio.tsx` (+ small helpers under `src/lib/`).
- Migration: add columns `engine_version`, `motion_score`, `motion_diversity`, `transition_count`, `render_mode`, `validation_passed`, `admin_review_reason`, `error_code`, `error_message` to `cinematic_ad_jobs` if missing.

## Acceptance
- No `banned_copy:heal` reaches preflight.
- No misleading "Voice synthesis failed" toast.
- No infinite "In queue".
- At least one concept reaches a real MP4 OR every concept fails with a precise, mapped reason.
- `RENDER_WORKER_SECRET` mismatches surface as an admin-visible failure, never an endless queue.
