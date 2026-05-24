
# Emergency Stabilization Plan

This is a large multi-phase request. Given the Render worker is currently suspended, I'm prioritizing stabilization (Phases 1–3, 8) and the chunked cleanup refactor first. The creative-quality + funnel work (Phases 4–7 of the second brief) becomes a follow-up once the worker stays up.

## Priority order (what I will ship now)

### 1. Render worker SAFE MODE (kills crash loop)
File: `render-worker/start.mjs` (and any orchestrator modules it imports).

- Add `WORKER_SAFE_MODE=1` env flag (default ON until we explicitly disable).
- In safe mode the worker only does: claim 1 job → render → upload → report → idle. No Pinterest publish, no cleanup, no audit, no autopilot, no AI rescoring, no repair loop, no auto-retry beyond `MAX_RETRIES=1`.
- Hard limits: `RENDER_CONCURRENCY=1`, `BATCH=1`, `STARTUP_TIMEOUT_MS=20000`, `RENDER_TIMEOUT_MS=1200000`.
- Boot diagnostics: structured JSON log at each phase (`env_check`, `supabase_connect`, `pinterest_auth_skipped_safe_mode`, `queue_connect`, `ready`). Memory + node version printed once.
- Crash-loop guard: if startup fails, write `/tmp/worker-fatal.json`, sleep 30s, exit with code 0 (so Render restarts politely instead of fast-looping).
- Subsystem isolation: every non-render subsystem call wrapped in `try/catch` that logs and disables the subsystem for the rest of the process — never crashes render.

### 2. Health/observability endpoint
File: `render-worker/start.mjs` health server.

- `/api/health/worker` returns `{ uptime, safe_mode, queue_depth, last_job_at, last_render_ms, mem_mb, subsystems: {pinterest, cleanup, audit}, crash_reason }`.
- Also mirrored to `public/api/health/worker` static stub for the frontend probe (already exists).

### 3. Pinterest cleanup → chunked resumable scans (kills compute exhaustion)
DB migration: new table `pinterest_cleanup_scan_sessions` with columns:
`id uuid pk, started_at, completed_at, status (running|paused|completed|failed), cursor text, processed_count int, remaining_count int, last_error text, mode text, options jsonb, created_by uuid`.
Plus index on `(status, started_at desc)`. RLS: admin-only via `has_role`.

Edge function rewrite: `supabase/functions/pinterest-cleanup-audit/index.ts`
- New modes: `start` | `continue` | `finalize` | `status` (keeps existing `recommend`/`execute`/`trust`).
- Per invocation: max 25 pins, hard 18s wall-clock budget, abort cleanly and persist cursor before timeout.
- Cache pin metadata + engagement in a request-scoped `Map`; dedupe Pinterest API calls.
- Rate limiter: token bucket, max 60 Pinterest GETs/min across the session row.
- "Light scan" option (`mode: light`): only duplicate slug frequency, age, low-engagement — skip phash/OCR/deep similarity.
- Idempotent: `start` returns existing running session if one exists for this admin instead of restarting.
- On crash: partial results already persisted; `status` endpoint exposes resume token.

### 4. Cleanup UI: progressive scan
File: `src/pages/admin/PinterestCleanupPage.tsx`
- Add "Start scan" / "Resume" buttons that call `start`/`continue` until `status=completed`.
- Progress bar (`processed_count / (processed_count+remaining_count)`), ETA based on rolling avg ms/pin, live partial recommendations table.
- Toggle: Light scan vs Full scan.
- Polls every 2s while running.

### 5. Premium creative pivot — enforcement only (no new AI)
The autopublish gate already enforces 14-day product / 30-day hook / phash / score floors / blocked styles (shipped last turn). I will tighten the publish cadence:
- `cinematic_ad_settings` defaults: `max_publishes_per_hour=2`, `max_publishes_per_day=8`.
- `cinematic-ad-autopublish` reads those caps before claiming a job. If exceeded, no-op (does not crash).

I will NOT in this turn build: Creative DNA Memory store, full funnel event taxonomy expansion, PDP rewrite, hero-product allocator. Those are tracked as follow-ups so we don't repeat the over-expansion that caused this incident.

## Files touched

- `render-worker/start.mjs` (safe mode + boot diagnostics + health)
- `render-worker/lib/*` as needed (subsystem isolation)
- `supabase/migrations/<ts>_cleanup_scan_sessions.sql` (new table + RLS)
- `supabase/migrations/<ts>_publish_caps.sql` (cinematic_ad_settings columns)
- `supabase/functions/pinterest-cleanup-audit/index.ts` (chunked modes + rate limit + cache)
- `supabase/functions/cinematic-ad-autopublish/index.ts` (hourly/daily cap check)
- `src/pages/admin/PinterestCleanupPage.tsx` (progressive UI)
- `mem/marketing/pinterest-premium-pivot.md` (note caps + scan-session contract)
- `.lovable/plan.md` (carry remaining Phases 4–7 of creative brief as backlog)

## Explicit deferrals (called out so they aren't lost)

- Workers B/C/D split (publish/audit/cleanup) — Render only has one worker today; splitting requires new services and env. Filed as backlog. Subsystem isolation inside the single worker covers the crash-safety requirement immediately.
- Funnel events expansion (`rage_click`, `session_quality_score`, etc.), PDP conversion upgrade, Creative DNA Memory — backlog after 72h stable.

## Success check before I report done

- `render-worker/start.mjs` boots in safe mode locally without crashing when Pinterest creds are missing.
- `pinterest-cleanup-audit` `start` + `continue` round-trip processes a 25-pin window and persists cursor.
- `/admin/pinterest-cleanup` shows progress and resumes.
- Migrations apply clean; types regenerate.

Ready to execute on approval.
