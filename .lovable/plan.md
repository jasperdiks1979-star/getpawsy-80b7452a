## Goal
Migrate Pinterest publishing from 100% legacy to 100% PCIE2 via a gated, reversible rollout. No blind enablement. Every phase has a hard pass/fail; any fail halts and either rolls back or surfaces evidence.

## Phase 1 — Legacy publish-capability audit (read-only)
Build `supabase/functions/pcie2-migration-audit/index.ts` (admin-JWT). It scans and returns evidence per category:
- Edge functions: grep deployed function code for `/v5/pins` POST/PATCH outside `pcie2-publisher`.
- Cron: `select jobname, schedule, command, active from cron.job where command ilike '%pinterest%' or jobname ilike '%pin%'`.
- Queues/workers: row counts in `pinterest_pin_queue`, `pinterest_publish_queue`, `pinterest_video_queue`, `pinterest_recovery_queue`, `pinterest_regeneration_queue`, `pinterest_overlay_replacement_jobs`, `pinterest_live_pin_repair_queue` with `status in ('queued','processing','retry')`.
- Webhooks/API routes: scan `supabase/functions/**` for HTTP handlers that enqueue publish work.
- Feature flags: dump `app_config` keys matching `pinterest_*`, `autopilot_*`, `pcie2_*`.
- Background jobs: `background_jobs`, `marketing_jobs`, `job_runs` recent pinterest activity.
- Orphans: any function not in PCIE2 allowlist that imports `pinterestFetch`.
Output: `pcie2_migration_audits` row + JSON report. **Pass = 0 publish-capable legacy paths**. Any finding halts the run with evidence appended to the executive report.

## Phase 2 — PCIE2 readiness check
Same function, `mode=readiness`. For each module verify presence + last successful invocation + dependency table populated:
classifier, headline AI, hook AI, creative evolution, quality engine, SEO engine, similarity gate, board intelligence, publisher, queue, Pinterest API token (debug token + scopes), pipeline trace writer, product resolver, tracking (`pinterest_capi_outbox`), analytics (`pinterest_analytics_daily`).
Each module returns `green|yellow|red` with reason. **Pass = all green**.

## Phase 3 — Feature-flag normalization
Inventory all `pcie2_*` and legacy `pinterest_*` flags. Produce a desired-state matrix:
```
pcie2_publish_enabled              = false (will flip in Phase 8 only)
pcie2_publish_guard                = true
pcie2_similarity_gate              = true
pcie2_classifier                   = true
pcie2_quality                      = true
pcie2_creative                     = true
pcie2_pipeline_trace               = true
pcie2_board_ai                     = true
pcie2_hook_ai                      = true
pcie2_headline_ai                  = true
pinterest_publishing_global_stop   = true (held until Phase 8)
pinterest_legacy_publisher_enabled = false
```
Write deltas via `app_config` upsert with audit row in `pcie2_pipeline_trace` (action=`flag_normalize`). No mixed state allowed; mismatches halt.

## Phase 4 — Snapshot for one-action rollback
New migration: `pcie2_migration_snapshots(id, taken_at, app_config jsonb, cron_jobs jsonb, queue_counts jsonb, function_versions jsonb, deployment_sha text, notes text)` + GRANTs + RLS (admin only).
Snapshot writer dumps:
- full `app_config`
- `cron.job` rows
- queue row counts + max(updated_at) per queue
- edge function names + deployed versions (via Supabase Management API; fall back to repo SHA from `git rev-parse HEAD`)
- current `deployment_sha`
Rollback function `pcie2-migration-rollback` restores `app_config`, re-enables `pinterest_publishing_global_stop`, sets `pcie2_publish_enabled=false`. One call = full revert.

## Phase 5 — Controlled canary (5 pins, dry-publish first, then live)
Extend `pcie2-publisher` with `mode: 'canary'`. Selection rule:
- 5 distinct products from 5 distinct functional classes
- 5 distinct boards, headlines, hooks, prompts, scene styles, AI model versions
- Reject if any duplicate axis collides (uses `pcie2_creatives` similarity hash)
Run order: dry-run all 5 → if all gate-pass → flip `pcie2_publish_enabled=true` scoped only to canary product IDs via allowlist column on `pcie2_publish_queue` → publish 5 → leave `pinterest_publishing_global_stop=true` for everything else.

## Phase 6 — Live Pinterest verification per pin
After each canary publish, call Pinterest `GET /v5/pins/{id}` and verify against `pcie2_pipeline_trace`:
pin exists, board id, title, description, image url hash, destination url, product slug, UTM params, metadata, trace id, AI version, publish timestamp, no CJ host, no duplicate hook/title/image vs last 200 pins. Any mismatch → mark trace `rejected_post_publish`, call `pcie2-publisher` `unpublish`, halt.

## Phase 7 — Quality gate expansion (20 more)
If 5/5 pass: publish 20 more under same per-pin verification. Any single failure: stop publishing, run rollback snapshot if `pcie2_publish_enabled` is broader than canary allowlist.

## Phase 8 — Legacy retirement (only on 25/25 pass)
- Drop `pinterest_publishing_global_stop` to false
- Set `pcie2_publish_enabled=true` (unscoped)
- Set `pinterest_legacy_publisher_enabled=false`
- Confirm legacy function stubs still return 410
- Confirm legacy crons remain unscheduled
- Archive snapshot of legacy queue rows to `pcie2_legacy_inventory` with action=`archived_post_migration`

## Phase 9 — Permanent pipeline trace
Ensure `pcie2_pipeline_trace` row written on every publish carries:
`pipeline_id, creative_id, creative_version, ai_model_version, prompt_version, similarity_score, headline_version, hook_version, board_decision, publish_ts, deployment_sha, source_product_id, quality_score`. Add missing columns via migration; backfill canary rows.

## Phase 10 — Reporting (mandatory)
Single Python script generates:
- `public/admin-reports/ai-implementation/2026-06-26-pcie2-controlled-migration.{pdf,json,html}`
- Sections: migration summary · phase-by-phase results · legacy audit evidence · readiness matrix · feature-flag diff · snapshot id · canary 5 results with live Pinterest verification · 20-pin quality gate · final flag state · remaining risks · recommendations · rollback instructions
Append to `manifest.json`. Copy to `/mnt/documents/`. Verify file existence, manifest update, and that the Admin → Reports page lists it (curl the manifest URL).

## Hard halts
- Phase 1 finds any publish-capable legacy → stop, report only.
- Phase 2 any red → stop.
- Phase 3 mismatch the run cannot resolve → stop.
- Phase 6 any pin fails live verification → unpublish + halt.
- Phase 7 any pin fails → halt + rollback if needed.

## Deliverables
- New function: `pcie2-migration-audit` (audit + readiness + flag check), `pcie2-migration-rollback`.
- Migration: `pcie2_migration_snapshots` table + columns added to `pcie2_pipeline_trace`.
- Extended: `pcie2-publisher` with canary + post-publish verification.
- Reports: PDF + JSON + HTML + manifest update + `/mnt/documents/` copies.
- Snapshot row stored, rollback callable in one action.

## Non-goals
- No new AI features.
- No UI changes beyond report surfacing.
- No Stripe/auth changes.
- No re-introducing legacy code.

Confirm to proceed and I will execute Phases 1–10 in one run, halting at the first hard fail.