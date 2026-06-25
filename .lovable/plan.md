
# Autonomous AI Creative Production Engine V1

Extends — never replaces — the existing CJ Media Intelligence Platform, Creative Optimization Engine V1, Pinterest stack, and Media Integrity Guard. All current production data, secrets, edge functions, cron jobs, dashboards and Pinterest queue logic stay untouched. Everything new is additive, idempotent, queued, observable, and gated by admin approval until proven safe.

The user request is enormous (10 phases, ~12 sub-systems). Building all of it in one autonomous run would be reckless: it would (a) burn significant Lovable AI credits on AI image/video generation before any winners are known, (b) risk overwriting existing pipelines (Cinematic V3/V4/V5 video, pinterest-viral-batch, premium creative engine V2, media integrity guard), and (c) violate the merchant-safe + Pinterest premium creative standards already enforced. This plan ships a real V1 that powers the full loop end-to-end, with hooks for every future phase, and uses every existing system instead of duplicating it.

## What ships in V1 (real, working, deployed)

### 1. Database (1 additive migration, admin-RLS, service_role full)

New tables:
- `cpe_pipeline_runs` — master row per nightly orchestrator run (status, phases_run, counts, costs, errors)
- `cpe_asset_versions` — version history per `cj_media_asset_registry` asset (sha256, source, supersedes_id, replaced_at) — enables CJ delta detection + auto-replace without losing originals
- `cpe_enhanced_images` — pointer rows: `asset_id → enhanced_url, premium_url, quality_score, scored_at, model, cost_usd`. Originals untouched.
- `cpe_lifestyle_scenes` — generated lifestyle images (product_id, scene_family, prompt_hash, image_url, anatomy_score, status)
- `cpe_creative_jobs` — unified job queue (kind: enhance|lifestyle|pinterest|copy|video|qa, payload jsonb, status, attempts, locked_by, locked_at, last_error). Indexed `(status, kind, run_at)`.
- `cpe_qa_results` — QA verdict rows referencing any `creative_assets.id` or `pinterest_pin_queue.id` (checks jsonb, pass bool, reasons[])
- `cpe_performance_weights` — winner DNA aggregations (dimension: color|layout|hook|cta|scene|typography, value, weight, sample_n, updated_at)
- `cpe_settings` — singleton (`auto_enhance`, `auto_lifestyle`, `auto_video`, `auto_publish` — all FALSE by default; `daily_ai_budget_usd=10`, `max_lifestyle_per_product=4`, `max_pinterest_per_product=6`)

Extends existing tables (additive columns only):
- `creative_assets` += `quality_score int, qa_status text default 'pending', enhanced_image_id uuid, lifestyle_scene_id uuid, winner_weight numeric`
- `cj_media_asset_registry` += `current_version_id uuid, last_delta_check_at timestamptz`

Two storage buckets created via tool: `cpe-enhanced` (private), `cpe-lifestyle` (private). Signed-URL reads via existing pattern.

### 2. Edge functions (8 new, all idempotent, all use existing `_shared/creative-helpers.ts`)

1. `cpe-orchestrator` — master nightly run. Spawns/enqueues phase workers, writes `cpe_pipeline_runs`. Respects `cpe_settings` toggles. Single advisory lock per run.
2. `cpe-cj-delta-detector` — extends `cj-media-orchestrator`: re-hashes registry rows older than 7d, marks superseded, enqueues `enhance` jobs for new versions. Never deletes originals.
3. `cpe-image-enhancer` — queue worker. Calls `openai/gpt-image-1-mini` edit mode with restoration prompt (sharpen, denoise, remove CJK/watermarks, repair edges). Writes to `cpe-enhanced` bucket. Scores via `google/gemini-3-flash-preview` vision (0-100). Budget-capped via `cpe_settings.daily_ai_budget_usd`.
4. `cpe-lifestyle-generator` — queue worker. For top-N scored products with `priority_score>=70`, generates 2 scenes from the 20-scene-family bank using `google/gemini-3.1-flash-image` (Nano Banana 2) with anatomy guards in prompt. Anatomy check via vision model rejects multi-limb/distorted outputs before save.
5. `cpe-creative-multiformat` — generates 2:3 / 1000x1500 / 1500x2250 / OG variants from approved lifestyle + enhanced sources using existing `_shared/pinterest-board-templates.ts` overlay rules (premium beige Scandinavian standard — memory enforced). Reuses existing diversity guard.
6. `cpe-copy-engine` — calls `google/gemini-3-flash-preview` for hook/headline/desc/CTA. Uses `creative_prompts` library + banned-phrase filter from existing memory. Stores 6 variants per creative.
7. `cpe-qa-engine` — runs every new creative through: media-integrity-guard (existing), text-safe-zone (overlay rules), banned-phrases, pHash duplicate vs last-100 queue items, brand compliance. Writes `cpe_qa_results`. Failed creatives → status=`qa_failed`. Required before any approval.
8. `cpe-performance-learner` — nightly. Joins `pinterest_analytics_daily` + `gi_pinterest_pin_metrics` + `creative_performance_snapshots`. Updates `cpe_performance_weights` and `pinterest_pattern_weights` (existing). Boosts generation weights of winners ≥ p75 CTR/save; suppresses losers into existing `pinterest_loser_blocklist`.

Video (Phase 6) is **not** a new pipeline — `cpe_creative_jobs` of kind=`video` enqueue into the existing `cinematic_v3_dispatch_queue`. No duplicate render workers. No new ffmpeg infra.

### 3. Cron (pg_cron, conservative, sequential, all chained from orchestrator)

- `cpe-orchestrator-nightly` — 02:45 UTC (before existing 03:30 cj-media + 04:15 creative-score). Chains: delta → enqueue enhance → enqueue lifestyle (gated) → enqueue copy → QA → learner. Auto-publish stays OFF.
- `cpe-queue-worker-10min` — drains `cpe_creative_jobs` (max 25 jobs/run, advisory-locked per row, kind-aware budget caps).
- `cpe-performance-learner-daily` — 05:30 UTC.

No cron triggers publishing. `pinterest_pin_queue` insert remains admin-approval-only.

### 4. Admin UI — `/admin/creative-intelligence`

Single new page (extends `/admin/creative-command`, doesn't replace it). Tabs:
- **Pipeline** — run history, phase timings, AI spend today vs cap, queue depth per kind, manual "Run orchestrator now"
- **Per product** — search/select product → original media | enhanced | lifestyle scenes | Pinterest creatives | copy variants | video links (cinematic v3 status) | QA scores | publish history. Actions: regenerate (per stage), approve, reject, favorite, bulk regenerate, download.
- **Learning** — top winner DNA dimensions, loser blocklist count, weight updates last 7d.
- **Settings** — toggle `auto_enhance`/`auto_lifestyle`/`auto_video`/`auto_publish`, daily budget, per-product caps.

Existing `/admin/media-intelligence` and `/admin/creative-command` keep working unchanged.

### 5. Safety, idempotency, observability

- Every job row has UNIQUE `(kind, dedupe_key)` where `dedupe_key = sha256(payload_stable_subset)` — duplicate enqueues no-op.
- Every AI call routed through `creative-helpers.recordSpend(run_id, function, usd)` against `cpe_pipeline_runs.ai_cost_usd`. Hard stop at `daily_ai_budget_usd`.
- Every worker uses `SELECT ... FOR UPDATE SKIP LOCKED` pattern via existing `_shared/queue-claim.ts`.
- All failures → `cpe_creative_jobs.last_error` + `monitoring_self_healing_logs` row, retried with exponential backoff up to 3 attempts.
- QA-failed creatives are quarantined, not deleted; admin can review and force-approve.
- All originals (cj_media_asset_registry rows + storage objects) are immutable. Enhancement, lifestyle, derivatives all live in separate buckets/rows. Originals can always be restored.

### 6. Validation run (executed at end of build)

1. Linter on migration.
2. Smoke-call each new function with `{dry_run:true}`.
3. Run `cpe-orchestrator` with `dry_run=true` → expect rows in `cpe_pipeline_runs` + planned jobs, **zero AI spend**, zero inserts into `pinterest_pin_queue`.
4. Run `cpe-image-enhancer` against 3 sample assets with `dry_run=false` (≤$0.30 AI spend) to prove the path end-to-end. Verify `cpe_enhanced_images` rows and signed URLs render.
5. Run `cpe-qa-engine` on 5 existing draft creatives → assert QA rows + statuses.
6. Run `cpe-performance-learner` → assert weight rows updated.
7. Assert `/admin/creative-intelligence` route loads.
8. Final report: tables created, functions deployed, jobs enqueued, AI spent ($X / $10 cap), QA pass rate, winners promoted, errors auto-healed.

## What is explicitly deferred (and why)

- **Auto-publishing to Pinterest** — stays admin-approval-only. The existing pin queue + integrity guard + diversity guard are already production-grade; flipping to auto-publish is a separate trust decision and a config toggle once V1 has 2 weeks of QA pass-rate data.
- **AI-generated videos rendered in this run** — Cinematic V3/V4/V5 already render videos via the GitHub Actions secure rendering gateway. V1 enqueues into that system instead of building a parallel renderer. First nightly video batch will appear in the existing cinematic dashboard.
- **Full 20-scene-family lifestyle generation for all 4,223 assets** — would cost ~$300+ in image credits. V1 generates for the top 30 winners per night under the $10/day budget; full coverage happens organically over ~6 weeks. Admin can raise the cap.
- **Auto-replacement of homepage/PDP live visuals** — enhanced/premium images surface in the dashboard, approval routes them into existing media columns. No silent live-asset swaps.
- **Meta/Google asset feeds** — Google Shopping feed already exists; V1 writes enhanced image URLs into `products.image_url_enhanced` for the feed to optionally pick up. Meta is a future channel (no current connector).

## Hard limits

- `daily_ai_budget_usd=10` (configurable), hard-stop in `creative-helpers.recordSpend`
- `max_lifestyle_per_product_per_run=2`, `max_pinterest_per_product_per_run=3`
- `auto_publish=false`, `auto_video=false`, `auto_lifestyle=false`, `auto_enhance=true` (only enhancement runs unattended — non-destructive, originals preserved)
- Idempotency on every job + every AI call
- All new tables admin-RLS only

## Files added / edited (estimate)

- `supabase/migrations/<ts>_cpe_v1.sql` (1)
- `supabase/functions/cpe-{orchestrator,cj-delta-detector,image-enhancer,lifestyle-generator,creative-multiformat,copy-engine,qa-engine,performance-learner}/index.ts` (8)
- `supabase/functions/_shared/cpe-helpers.ts` (1)
- `src/pages/admin/CreativeIntelligencePage.tsx` (1)
- `src/App.tsx` (route only)
- `supabase/config.toml` (function entries only)

No existing edge functions, tables, or pages are modified destructively.
