# Self-Healing Pinterest Engine V1

Builds a closed-loop watchdog so the Pinterest pipeline never goes dark. Sits on top of the existing V4 / V5 stack (eligibility, gold-standard scorer, credit guard, warehouse engine, video queue, render worker) — does not replace them.

## 1. Data model (single migration)

New tables (admin read, service write, full GRANT block + RLS):

- `pinterest_pipeline_health_snapshots` — 5-min rollups: `videos_generated_24h`, `pins_generated_24h`, `pins_published_24h`, `pending_videos`, `pending_pins`, `failed_24h`, `recovered_24h`, `avg_render_ms`, `publish_rate_per_hour`, `last_video_at`, `last_pin_at`, `health_score`, `mode` (`normal|recovery|emergency|light_render`), `reasons jsonb`.
- `pinterest_pipeline_failures` — `id`, `source` (`pinterest_api|render|inventory|cj|supabase|storage|voice|media|other`), `job_type`, `job_id`, `error_code`, `error_message`, `attempt`, `next_retry_at`, `resolved_at`, `created_at`.
- `pinterest_pipeline_recovery_runs` — `id`, `trigger` (`low_queue|dead_pipeline|low_health|cron`), `actions jsonb`, `checks jsonb`, `outcome`, `health_before`, `health_after`, `started_at`, `finished_at`.
- `pinterest_pipeline_settings` (singleton id=1) — `target_pins_per_day=48`, `min_pins_per_day=24`, `min_pending_videos=20`, `min_pending_pins=30`, `dead_video_minutes=180`, `dead_pin_minutes=180`, `recovery_score=80`, `emergency_score=60`, `emergency_mode_enabled=true`, `light_render_enabled=true`.

Retry schedule (1m / 5m / 15m / 60m) lives in code; failures table just stores `attempt` and `next_retry_at`.

## 2. Shared module

`supabase/functions/_shared/pipeline-health.ts`
- `computeHealthScore(snapshot)` — weighted: throughput vs target (40), pending depth (15), failure ratio (15), dead-pipeline penalty (15), publish-rate (15). Clamped 0–100.
- `categorizeFailure(err)` — maps error text/code to the 8 sources.
- `nextRetryAt(attempt)` — 1/5/15/60-minute ladder, caps at 60m, gives up after 4.
- `recordFailure(supabase, payload)` and `markResolved(supabase, id)`.

## 3. Edge functions

All admin-JWT-gated where user-facing, service-role for crons. Wrap every gateway call with the existing `pinterest-credit-guard.aiGatewayFetch`.

1. `pipeline-health-monitor` (cron every 5 min)
   - Pulls counts from `pinterest_video_queue`, `pinterest_pin_queue`, `cinematic_ad_jobs`, `pinterest_video_publish_log`, `pinterest_publish_logs`.
   - Writes a `pinterest_pipeline_health_snapshots` row + sets `pinterest_pipeline_settings.current_mode`.
   - If `pending_videos < min_pending_videos` → invokes `pipeline-auto-replenish` (`kind: video`).
   - If `pending_pins < min_pending_pins` → invokes `pipeline-auto-replenish` (`kind: pin`).
   - If `health < recovery_score` or dead-pipeline (>3h no video/pin) → invokes `pipeline-recovery-run`.
   - If `health < emergency_score` → flips `current_mode=emergency`, invokes `pipeline-emergency-content`.

2. `pipeline-auto-replenish`
   - Selects winner-priority products: `effective_stock > 0`, ordered by `inventory_priority DESC`, then `pinterest_revenue_scores.score DESC`, then `media_score DESC`. Caps to delta needed.
   - Enqueues into the existing `cinematic_ad_jobs` (for video) or `pinterest_pin_queue` (for pin) using the existing producers — never bypasses Gold Standard or eligibility gates.

3. `pipeline-recovery-run`
   - Health checks (each writes into `checks` jsonb): pg_cron job rows for known schedules, last heartbeats (`render_worker_heartbeats`, `cinematic_worker_heartbeats`), Pinterest token freshness via `pinterest_connection`, queue depths, storage reachability (HEAD on a known asset), AI gateway via `pinterest-credit-state`.
   - Actions: re-kick stuck jobs (`rendering > 20m → render_queued`, `processing > 10m → pending`), retry failures whose `next_retry_at <= now()`, fire `cinematic-ad-worker-control:{action:'wake'}`, re-invoke autopilot, refresh Pinterest token if `< 1h to expiry`.

4. `pipeline-emergency-content`
   - When AI render unavailable or credits red: enqueues pins using existing product video / photo assets via `pinterest-video-publisher` (`queue_draft`) with `creative_source_tier='product_video' | 'photos'`. Skips AI render entirely. Keeps publish flowing.
   - `light_render_enabled`: forces `cinematic_ad_settings` flag `force_light_motion=true` for the run window.

5. `pipeline-failure-retry` (cron every minute)
   - Picks up to 50 unresolved `pinterest_pipeline_failures` with `next_retry_at <= now()`, re-invokes the original job type, increments `attempt`, marks resolved on success, escalates to `monitoring_alerts` after attempt=4.

6. `pipeline-health-dashboard` (admin)
   - Returns latest snapshot + last 24h trend + open failures by source + recent recovery runs.

## 4. Wiring into existing functions

- `cinematic-ad-autopublish`, `pinterest-video-publisher`, `pinterest-pin-creator`, `pinterest-pipeline-drain`, `pinterest-regen-autopilot` get a small `try/catch` wrapper that calls `recordFailure()` with the categorized source on any throw or non-2xx Pinterest response. No behavior change on success.
- `pinterest-eligibility` already uses `effective_stock`; nothing to change. Replenish reuses it as the gate.
- Quality Protection: replenish + emergency both go through existing eligibility (no static, no 404, no OOS, no empty voice) and Gold Standard gate (≥80) when AI render is on. Emergency mode bypasses Gold Standard ONLY for `product_video` source with valid runtime ≥ 5s — never for static images.

## 5. Cron schedule (pg_cron, via `supabase--insert`)

- `pipeline-health-monitor` every 5 min
- `pipeline-failure-retry` every 1 min
- `pipeline-recovery-run` every 30 min (safety net; monitor already triggers on demand)

## 6. Admin UI

`src/components/admin/PipelineSelfHealingPanel.tsx` mounted on `/admin/pinterest-revenue-v4`:
- Big health score gauge + current mode badge (`normal/recovery/emergency/light`).
- Tiles: videos today, pins today, published today, pending videos, pending pins, failed 24h, recovered 24h, avg render time, publish rate, last video age, last pin age.
- Lists: open failures by source, last 10 recovery runs with outcome.
- Buttons: "Force health check", "Force recovery run", "Force emergency content", "Reset retries".

Reuses existing `PipelineHealthBanner` styling.

## 7. Out of scope

- New warehouses or new product sources (covered by Inventory V1).
- Pinterest creative quality tuning (covered by Gold Standard).
- New AI providers / credit top-up automation (credit-guard already pauses + resumes).

## 8. Files

**Created**
- `supabase/migrations/<ts>_self_healing_pinterest_engine.sql`
- `supabase/functions/_shared/pipeline-health.ts`
- `supabase/functions/pipeline-health-monitor/index.ts`
- `supabase/functions/pipeline-auto-replenish/index.ts`
- `supabase/functions/pipeline-recovery-run/index.ts`
- `supabase/functions/pipeline-emergency-content/index.ts`
- `supabase/functions/pipeline-failure-retry/index.ts`
- `supabase/functions/pipeline-health-dashboard/index.ts`
- `src/components/admin/PipelineSelfHealingPanel.tsx`

**Edited**
- `src/pages/admin/PinterestRevenueV4.tsx` (mount panel)
- `supabase/functions/cinematic-ad-autopublish/index.ts` (failure recorder)
- `supabase/functions/pinterest-video-publisher/index.ts` (failure recorder)
- `supabase/functions/pinterest-pipeline-drain/index.ts` (failure recorder)
- `supabase/functions/pinterest-regen-autopilot/index.ts` (failure recorder)
- `mem/marketing/pinterest-revenue-engine-v4.md` (append "Self-Healing V1" section)
- `.lovable/plan.md`

Proceed on approval — no demo, no mock data, productie direct.
