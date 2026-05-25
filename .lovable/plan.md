
# Cinematic Ads + Pinterest Autopilot — End-to-End Stabilization

This is a large, multi-system change. I'll ship it in one coherent pass, but flag what's deferred so we don't repeat last week's over-expansion.

Expected Supabase host (hardcoded check): `nojvgfbcjgipjxpfatmm.supabase.co`.

---

## 1. Render worker hardening (`render-worker/start.mjs`)

- New `validateEnv()` runs before anything else:
  - Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RENDER_WORKER_SECRET`.
  - If `VITE_SUPABASE_URL` missing → fall back to `SUPABASE_URL` server-side (no crash).
  - If `new URL(SUPABASE_URL).host !== "nojvgfbcjgipjxpfatmm.supabase.co"` → log fatal with the wrong host, keep health server up, set `bootPhase=fatal_wrong_supabase_host`.
- Health server starts FIRST (before Supabase / queue) so `/api/health/worker` always answers JSON.
- `/api/health/worker` returns: `ok, ready, bootPhase, supabaseHost, expectedSupabaseHost, safeMode, lastHeartbeatAt, queueDepth, activeJobs, renderAvailable, pinterestPublishAvailable, errors[]`.
- 60s heartbeat → upserts `render_worker_heartbeats(worker_id, last_seen_at, queue_depth, supabase_host, safe_mode)`.
- Subsystem isolation preserved: render/publish failure never kills health server.
- Structured boot logs: `env_validated`, `health_server_started`, `supabase_connected`, `queue_poll_started`, `job_claimed`, `job_completed`, `job_failed_recoverable`, `job_failed_fatal`.
- Pinterest publish only attempted if `PINTEREST_*` creds + connection row present; otherwise job marked `blocked` with reason.

## 2. Database migration (idempotent)

New columns on `cinematic_ad_jobs` (all `IF NOT EXISTS`):
`archived_at, archive_reason, pinterest_pin_id, pinterest_url, verified_at, remote_exists, qa_score, motion_score, uniqueness_score, duplicate_risk, publishable_reason, product_cooldown_until, hook_cooldown_until, worker_last_error, hook_score, caption_score`.

New tables:
- `cinematic_ad_audit_events(id, job_id, action, actor, reason, before_json, after_json, created_at)` — RLS admin-only via `has_role`.
- `pinterest_publish_verifications(id, job_id, pin_id, pin_url, remote_exists, checked_at, error)` — RLS admin-only.
- `render_worker_heartbeats(worker_id pk, last_seen_at, queue_depth, supabase_host, safe_mode, payload jsonb)` — RLS admin read, service-role write.

## 3. Truthful Pinterest status

Edge function `pinterest-pin-deletion-verify` (already exists) extended with `verify_job` mode:
- Input: `job_id` or batch `job_ids[]`.
- Calls `GET /v5/pins/{pin_id}` with active token; classifies `verified | not_found | inaccessible | no_pin_id`.
- Writes to `pinterest_publish_verifications` + updates `cinematic_ad_jobs.verified_at, remote_exists, status`.
- Status rule enforced server-side:
  - `Pinterest Uploaded` only if `remote_exists=true`.
  - Else recompute to one of: `Publish failed | Archived | Needs rerender | Ready to publish`.

## 4. Stale-duplicate archive

New edge function `cinematic-ads-archive-stale`:
- Admin-only (`has_role(uid,'admin')`).
- Selects jobs matching ANY of:
  - engine_version pre-V3/V4,
  - same `product_slug` + same `thumbnail_phash` (within Hamming ≤4) duplicates beyond the newest,
  - `pin_publish_attempts >= 3` AND no `pinterest_pin_id`,
  - status `pinterest_uploaded` AND (`pinterest_pin_id` null OR last verification `remote_exists=false`),
  - repeated identical static-image MP4s of `enclosed-cat-litter-box*` slugs.
- Sets `archived_at=now()`, `archive_reason=<rule>`, `status='archived'`. Logs to `cinematic_ad_audit_events`.
- NEVER calls Pinterest delete unless `confirm: "DELETE"` typed by admin (separate explicit action, not part of archive).

## 5. QA / motion gate

In `cinematic-ad-autopublish` and on render completion:
- Compute `motion_score` from frame-difference proxy (already-stored scene plan length × scene transitions; if `<3 unique scenes`, motion_score auto = 30).
- Compute `uniqueness_score` from pHash distance vs last 100 published.
- Compute `duplicate_risk` = inverse of uniqueness.
- Publish gate: `qa_score>=70 AND motion_score>=60 AND uniqueness_score>=70 AND duplicate_risk<=25`. Else mark `publishable_reason="qa_below_threshold:<which>"` and skip — surface in UI.

## 6. Diversification (autopublish)

Already enforces 14-day product cooldown / 30-day hook cooldown. Add:
- `max 1 pin per product per day` check.
- `max 2 pins per product per 14 days` check.
- Category rotation: select next eligible job whose `creative_category` differs from the last 3 published categories (litter box, cat tree, dog bed, pet harness, feeding, grooming, toys, carriers).
- If nothing eligible, do NOT publish duplicates — record `publishable_reason="no_diverse_assets"` on settings row and surface in UI.

## 7. Discovery improvements (`pinterest-video-discovery`)

- Per-bucket counts in response: `{bucket, scanned, mime_skipped, size_skipped, dedupe_skipped, inserted}`.
- Admin-only `force_register` mode (still validates dedupe).
- If 0 usable across all buckets → autopilot kicks `cinematic-ad-storyboard` to draft a fresh video from a product image instead of being silent.

## 8. Admin UI — Cinematic Ads Control Center

Top-of-page **System Truth Panel** showing live values (calls health endpoint + reads DB):
- Render worker health, Supabase host expected vs actual, heartbeat age, queue depth, publishable jobs, blocked jobs, last successful render, last verified pin, last error, current blocker.
- Buttons: Run health check, Verify Pinterest pins (batch), Archive stale duplicates, Generate fresh diverse batch, Render next safe job, Publish next verified high-QA pin.
- "Why nothing is happening?" box: derives reason from settings + queue + caps.

Per-job row:
- Show truthful status (post-verification).
- "Verify on Pinterest" + "Rerender improved video" buttons.
- Block "Publish selected" client-side AND server-side if any selected job is `archived` / no longer publishable.

## 9. Acceptance — surfaced in dashboard

Each check renders pass/fail in a panel:
- health JSON ok+ready
- supabase host match
- no recent worker fatal events
- stale jobs archived count
- selected-archived publish blocked test
- fresh job has motion + passes QA before publish
- one verified test pin URL

## Files to touch

- `render-worker/start.mjs` — env validator, host check, health-first boot, heartbeat, expanded health JSON
- `supabase/migrations/<ts>_cinematic_truth_layer.sql` — new columns + 3 tables + RLS
- `supabase/functions/cinematic-ads-archive-stale/index.ts` — NEW
- `supabase/functions/pinterest-pin-deletion-verify/index.ts` — extend with `verify_job` / batch
- `supabase/functions/cinematic-ad-autopublish/index.ts` — daily/14d caps, category rotation, QA gate, blocker reason
- `supabase/functions/pinterest-video-discovery/index.ts` — per-bucket counters, force_register
- `supabase/functions/cinematic-ad-worker-control/index.ts` — `system_truth` action aggregating panel data
- `src/pages/admin/CinematicAdsControlCenterPage.tsx` — System Truth Panel + new buttons + safe Publish
- `src/integrations/supabase/types.ts` — regenerated by migration
- `mem/features/cinematic/video-engine-v3.md` — note caps + truth layer
- `.lovable/plan.md` — update

## Explicit deferrals

- True FFmpeg frame-diff motion analyzer (heavy, runs in worker). I'll ship the scene-plan proxy now and file FFmpeg analyzer as backlog so we don't reintroduce worker crashes.
- Splitting publish/audit/cleanup into separate Render services — still one worker; subsystem isolation covers the safety requirement.
- Auto-deletion of remote Pinterest pins — kept behind explicit typed-DELETE confirmation flow only.

## Success check before reporting done

1. `render-worker/start.mjs` passes env validator with the correct host; logs `env_validated` + `health_server_started`.
2. Migration applies cleanly; types regenerate; no RLS warnings on new tables.
3. `system_truth` action returns expected shape; UI panel renders without crash.
4. Archive function dry-run on staging dataset returns expected candidate counts.
5. Publish-of-archived blocked end-to-end (server enforces).

Ready to execute on approval.
