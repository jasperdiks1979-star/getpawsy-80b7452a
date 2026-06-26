
# GetPawsy Evolution Engine V1 — Phased Implementation Plan

The full 19-module spec is enormous (~25 new tables, ~15 new edge functions, 1 dashboard, multiple crons, full validation suite). Shipping all of it in a single run would risk regressions to the protected systems (OAuth, Publisher, Guardian, CI Layer, Queue, Canary, Global Stop, Recovery, Legacy Guards) and would be impossible to QA in one pass.

I will ship it in **three phases**. Each phase is fully additive — zero edits to existing publishing, queue, OAuth, Guardian, CI, or safety-lock code. Each phase ends with the standard AI Implementation Report (PDF + JSON + manifest update).

I will ask you to approve each phase before starting the next one.

## Non-negotiable invariants (apply to all phases)

- All new tables prefixed `ee_` (evolution engine) so they cannot be confused with `pcie2_*` queue/publisher tables.
- All new edge functions prefixed `evolution-*`. None of them write to `pcie2_publish_queue`, `pinterest_pin_queue`, `pinterest_connection`, `app_config`, `guardian_*`, `pcie2_ci_*`, or any publisher table.
- Evolution Engine only **reads** publisher/queue/CI/Guardian tables and **writes** to its own `ee_*` tables.
- The single seam back to production is one optional read-only field on the dashboard ("AI suggested headline" badge next to a queue row). No write path.
- Global Stop, `pcie2_publish_enabled=false`, Canary, Guardian gates, CI trigger — all remain authoritative. The Evolution Engine cannot publish.

## Phase 1 — Foundation + Learning + Predictive (this run)

Goal: make the data substrate that everything else depends on. No autonomous behaviour yet.

### Tables (all `ee_*`, admin/service_role only)

```text
ee_learning_history       per-pin daily snapshot: pinterest + GA4 + revenue metrics
ee_learning_events        raw observation log (immutable, append-only)
ee_learning_vectors       per-pin feature vector (headline_id, image_dna_id, emotion_id, board_id, hour_bucket, scores)
ee_learning_products      per-product rollup scores
ee_learning_boards        per-board rollup scores
ee_predictions            pre-publish predictions vs actuals
ee_model_versions         tracks which scoring model produced each prediction
ee_runs                   run log for every nightly job (status, duration, errors)
ee_run_steps              per-step trace
ee_settings               feature flags (default ALL OFF — observation only)
```

### Edge functions

- `evolution-learning-ingest` — pulls Pinterest analytics, GA4 (via existing tables), revenue per pin → writes `ee_learning_*`. Read-only on source tables.
- `evolution-predictive-score` — given a draft row id, computes predicted CTR/saves/purchases/ROAS/confidence using a transparent linear model over `ee_learning_vectors`. Writes to `ee_predictions`. Does not gate anything.
- `evolution-nightly-rollup` — recomputes product + board rollups, refreshes confidence intervals.

### Cron

One nightly job at `04:17 UTC` that runs `evolution-nightly-rollup`. Disabled by default in `ee_settings`; only enabled after you approve.

### Dashboard

`/admin/evolution-engine` — Phase 1 panels only:
- Learning Progress (rows ingested, products covered, days of history)
- Top Products / Boards / Headlines / Emotions (read-only leaderboards)
- Prediction vs Actual scatter (for any draft scored so far)
- Run log
- "Mode: OBSERVATION ONLY" banner

### Validation in Phase 1

- DB linter clean on new tables
- Confirm Publisher / Queue / Guardian / CI / Canary tables and code are unchanged (grep diff report in the AI Implementation Report)
- Confirm `pcie2_publish_enabled` and `global_stop` untouched
- Confirm no new triggers on existing tables

## Phase 2 — Evolution + Trend + Emotion + Image DNA + Experiment

Adds modules 2, 3, 4, 5, 8, 17 once Phase 1 data exists. Headline/image/emotion families, automatic experiment scoring, nightly "retire weak / clone winning" pass — but always writing to `ee_*` and into the existing `pcie2_*` draft tables (NEVER directly into `pcie2_publish_queue`, which the existing CI trigger guards anyway).

## Phase 3 — Competitor + Seasonal + Geo + Ads Intelligence + Marketing Brain + Executive Dashboard

Adds modules 6, 12, 13, 14, 15, 18, 19. Each is recommendation-only by spec. Ads Intelligence is read-only against the OAuth token we already have.

## Technical notes

- All new RLS: `SELECT` to authenticated admins via `has_role`, `ALL` to `service_role`. No anon grants.
- Validation triggers (not CHECK constraints) for any time-dependent rule (e.g. `ee_predictions.window_end > window_start`).
- Phase 1 uses only the Lovable AI Gateway (`google/gemini-3-flash-preview`) for any text scoring; no new external secrets.
- Reports per phase: `public/admin-reports/ai-implementation/2026-06-26-evolution-engine-phase-N.{pdf,json}` + manifest update.

## What I need from you

Confirm **"go Phase 1"** and I will:

1. Run the Phase 1 migration (one approval for all 11 tables + RLS + grants).
2. Deploy the three `evolution-*` edge functions.
3. Build `/admin/evolution-engine` Phase 1 dashboard.
4. Wire the disabled nightly cron.
5. Run the validation suite and ship the Phase 1 PDF + JSON report.

I will not start Phase 2 until you approve the Phase 1 report.
