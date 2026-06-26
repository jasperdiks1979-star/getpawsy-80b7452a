## Goal
Make PCIE2 the **only** code path that can POST to Pinterest. Physically remove every legacy publisher/cron/queue/route, add a deploy-time guard that fails CI if any reappears, and prove it with a 50-pin E2E + full pipeline trace + PDF/JSON/HTML report.

The previous run only added a soft kill-switch. This run physically deletes legacy code and seeds PCIE2 so it can actually publish.

---

## Phase 1 — Discovery (read-only, produces inventory)
1. Grep `supabase/functions/**` for every caller of `/v5/pins`, `pinterestFetch`, `media_source`, `pinterest_pin_queue`, `pinterest_publish_queue`, `pinterest_video_queue`, `pinterest_recovery_queue`, `pinterest_regeneration_queue`, `pinterest_overlay_replacement_jobs`, `pinterest_live_pin_repair_queue`.
2. Dump `cron.job` (jobname, schedule, command) and `pg_trigger` rows referencing pinterest-*.
3. Dump `app_config` keys matching `pinterest_*`, `autopilot_*`, `revenue_priority_*`.
4. Emit `legacy_publisher_inventory.json` under `public/admin-reports/ai-implementation/` with: name, location, trigger, last_run (from `cron_job_logs` / function logs), upstream, downstream, action (delete/replace/keep).

## Phase 2 — Physical legacy removal
Delete every non-PCIE2 publisher rather than soft-blocking. Targets (final list comes from Phase 1, expected):
- Edge functions removed via `supabase delete`: `pinterest-publish-now`, `pinterest-zap`, `pinterest-scheduler`, `pinterest-cron-worker`, `pinterest-automation`, `pinterest-video-publisher`, `pinterest-live-pin-repair-execute`, `pinterest-regen-autopilot`, `pinterest-revenue-autopilot`, `pinterest-autopilot-watchdog`, `pinterest-content-correction`, `pinterest-recovery-*`, `pinterest-overlay-replacement-*`, `pinterest-creative-director` (publishing path), `pinterest-viral-batch` (insert-to-queue path).
- Cron: `cron.unschedule` everything from Phase 1 step 2 except the single PCIE2 cron. Snapshot to `pinterest_cron_disabled_snapshot` (already exists) with reason `legacy_removed_v2`.
- Repo cleanup: `rm -rf` the function dirs, remove their `[functions.*]` entries from `supabase/config.toml`, drop dead imports.
- Frontend: remove admin buttons that invoke removed functions (search `supabase.functions.invoke('pinterest-publish-now'|...)`).

Anything that still needs to exist for read-only history (logs, metrics) stays; only publish-capable code is deleted.

## Phase 3 — PCIE2 made the sole live publisher
1. `pcie2-publisher` is the only function with permission to call `/v5/pins`. Add a runtime assertion at the top of the publish call: `assert(Deno.env.get('PCIE2_PUBLISHER') === 'true')` and only set that env on this one function.
2. Mandatory in-order gates, each writes `pcie2_pipeline_trace`:
   classifier → headline_intel → hook_intel → seo_intel → creative_intel → visual_quality → brand_compliance → duplicate → similarity → policy → board_intel → product_match → publish_readiness → approval → publisher.
3. Backfill PCIE2 source-of-truth tables from existing data so gates can actually pass:
   - `pcie2_product_understanding` ← `pin_product_classification` + `pin_product_understanding` (428 rows).
   - `pcie2_headline_library` ← curated subset of `pin_headline_bank` filtered by classifier category match + banned-phrase scrub.
   - `pcie2_hook_library` ← `pin_hook_library_v2` (51 rows) mapped to classes.
4. Flip `pcie2_publish_enabled = true` **only after** Phase 9 passes.

## Phase 4 — Hard reject reasons
Enum `pcie2_reject_reason`: `irrelevant_headline, wrong_cta, wrong_category, wrong_board, cj_supplier_image, missing_lifestyle, duplicate, similarity_exceeded, wrong_audience, wrong_niche, clickbait, text_overload, brand_mismatch, no_product_match, missing_seo_score, missing_ai_score, missing_publish_score, missing_visual_score, missing_policy_score`. Publisher cannot read rejected rows.

## Phase 5 — Pipeline Trace
Extend `pcie2_pipeline_trace` with: `pipeline_id, generation_id, prompt, ai_model, image_model, video_model, creative_version, headline_version, hook_version, classifier_version, similarity_version, quality_version, publisher_version, cron, worker, queue, source_product, source_images, prompt_hash, output_hash, approval_reason, rejection_reason, confidence, publish_score`. New admin route `/admin/pinterest-pipeline-trace/:pinId` renders the chain.

## Phase 6 — Live audit of historical pins
`pcie2-historical-audit` function classifies every row in `pinterest_pins` as `legacy | pcie2 | unknown` based on presence of a `pcie2_pipeline_trace` row + `meta.pipeline`. Results into `pcie2_historical_audit` table. Report includes the % split.

## Phase 7 — Deploy-time legacy guard
Add `scripts/pcie2-legacy-guard.mjs` (run in CI + `predeploy`): greps repo for forbidden symbols (legacy function names, `pinterestFetch(.+)pins`, `/v5/pins` outside `pcie2-publisher`). Wire into `.github/workflows/edge-function-types.yml`. Non-zero exit blocks deploy.

## Phase 8 — 50-pin E2E (dry-run)
`pcie2-e2e-test` extended to sample 50 active products across ≥13 categories (cat, dog, toy, camera, fountain, litter box, food, grooming, safety, training, travel, sleep, tech). Runs full pipeline in dry-run; verifies 0 duplicates, 0 CJ-host images, 0 category mismatches, 0 headline mismatches, 0 board mismatches, all confidence ≥ 0.85.

## Phase 9 — Regression vs legacy
Diversity metrics (headline/hook/image/CTA/visual/product/color/composition/brand/niche/animal/board/SEO) computed for last 200 legacy pins vs 50 PCIE2 dry-run pins. New must beat old on every axis or run fails.

## Phase 10 — Reporting (mandatory)
Write to `public/admin-reports/ai-implementation/2026-06-26-pcie2-legacy-elimination.{pdf,json,html}`:
Executive summary · Discovery inventory · Removed components (with file paths + cron names) · Replaced components · Remaining components + justification · Pipeline diagram · Dependency graph · Historical audit (legacy %, pcie2 %, unknown %) · 50-pin E2E results with thumbnails · Regression table · Deploy guard config · Final scorecard. Update `manifest.json`. Drop copies to `/mnt/documents/`. Reports must survive future runs (manifest append, never overwrite).

## Safety / non-goals
- `pcie2_publish_enabled` stays `false` until Phase 8 + 9 both pass.
- No Pinterest POSTs during this run (dry-run only).
- No Stripe / budget / auth changes.
- Legacy code is **deleted from the repo**, not soft-disabled. Re-adding it requires conscious code + a CI guard override.

## Deliverables
- Deleted: ~15 legacy edge functions, ~12 legacy crons, related admin buttons.
- New / extended: `pcie2-publisher` (real publish path), `pcie2-historical-audit`, `pcie2-e2e-test` (50 products), `scripts/pcie2-legacy-guard.mjs`, admin trace page, expanded `pcie2_pipeline_trace` columns, `pcie2_historical_audit` table, `pcie2_reject_reason` enum.
- Migrations: unschedule legacy crons (snapshot), add enum + columns + audit table + GRANTs.
- Reports: PDF + JSON + HTML in `public/admin-reports/ai-implementation/` + manifest update + `/mnt/documents/` copies.

Confirm to proceed and I will execute the full plan in one run.
