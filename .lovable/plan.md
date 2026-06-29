
# Genesis V3.4 — Self-Optimizing First Sale Engine

**Goal:** Maximize probability of GetPawsy's first sale via an autonomous hourly loop that reuses existing engines. No new dashboards, no duplicate logic, no placeholder AI.

---

## Reuse Inventory (no duplicates)

- Reads: `canonical_*`, `gv3_pi_scores`, `gv3_pin_growth_scores`, `gv3_mi_first_sale_plan_v`, `mi_*`, `market_*`
- Writes: `autopilot_actions`, `autopilot_outcomes_*`
- Functions reused: `market-signal-ingest`, `mi-feedback-loop`, `autopilot-dispatch`, `pcie2-publish-assembler`, Pinterest Creative Director, Recovery Governor
- SDKs: `src/lib/canonicalAnalytics.ts`, `src/lib/marketIntelligence.ts`, `src/lib/governanceLedger.ts`

---

## Phase 1 — Connector Health Verifier (new edge fn)

`gv34-connector-health-audit`: probes each external MI signal source and writes one row per connector to a new small table `gv34_connector_health` (last_run, reachable, auth_ok, response_bytes, parsed_rows, dedupe_ok, last_signal_ts, error_step, repair_action).

If a step fails: auto-repair (re-trigger ingest with cleared cursor) then re-probe. No new dashboards — surfaces in existing Market Intelligence "Engine" tab.

## Phase 2 — Hourly Decision Loop (new edge fn)

`gv34-decision-loop` (hourly cron): for each of the 10 opportunity classes, pick the top candidate from existing scoring tables, dedupe vs open `autopilot_actions` (hash of `{kind, product_id, payload_signature}`), and enqueue. Confidence-gated execution uses the existing `autopilot-dispatch`.

## Phase 3 — Creative Diversity Guard (new edge fn)

`gv34-creative-diversity`: scans recent Pinterest creatives, computes a similarity score across lighting/angle/breed/room/palette/headline/CTA/layout using existing PCIE2 metadata + perceptual hash. Writes diversity score to existing creative rows; only regenerates rows scoring below threshold AND with no positive outcome.

## Phase 4 — First Sale Hunter

SQL view `gv34_first_sale_hunter_v` built on existing `gv3_mi_first_sale_plan_v` + canonical funnel + ATC/checkout signals + inventory/shipping. Single prioritized list; consumed by the decision loop.

## Phase 5 — Learning Engine (new edge fn + cron)

`gv34-learning-evaluator` (every 6h): for each executed autopilot action, evaluate at 24h/72h/7d/30d windows using canonical events. Update `autopilot_actions.confidence` via Wilson lower bound with min sample gate. Decreases on repeated under-performance.

## Phase 6 — Resource Optimizer

`gv34_ai_credit_efficiency_v`: expected lift/revenue/first-sale-probability per AI credit per action class, derived from learning history. Decision loop reads this and re-ranks before queueing.

## Phase 7 — Execution Safety

Single Postgres unique index on `autopilot_actions (action_kind, target_id, dedupe_hash)` where `status in ('queued','executing')`. All inserts use `ON CONFLICT DO NOTHING`. Creative & CRO functions check existing recent run hashes before regenerating.

## Phase 8 — Autonomous First Sale Mode

Toggle flag in `governance_decision_log` (`mode='first_sale_autonomous'`). When ON, hourly cron orchestrates: connector audit → decision loop → diversity guard → learning evaluator. Each queued action records `why/data/expected_lift/confidence/ai_cost/expected_revenue` in its payload — already supported by `autopilot_actions.metadata`.

---

## Deliverables

- 1 migration: `gv34_connector_health` table, `gv34_first_sale_hunter_v` view, `gv34_ai_credit_efficiency_v` view, dedupe unique index, GRANTs
- 4 edge functions: `gv34-connector-health-audit`, `gv34-decision-loop`, `gv34-creative-diversity`, `gv34-learning-evaluator`
- 1 orchestrator cron (hourly) + 1 learning cron (6h)
- Small UI: a single "Autonomous First Sale Mode" toggle + status strip added to existing `GrowthCommandCenterPage` (no new page)
- Deployment report posted in chat: connector health, scheduler health, AI credit efficiency, learning status, autonomy status, first-sale probability, blockers

## Validation gates

- `tsgo --noEmit` clean
- `canonical_validate_consistency()` still 0% drift
- No edits to canonical_* tables/views
- Dedupe index present; manual duplicate insert returns 0 rows affected
- Connector health table has ≥1 row per known source after first run

## Out of scope

- New dashboards/pages
- Re-implementing scoring already in PI V3 / Pin Growth V3 / MI V3.3
- Video generation, direct publishing changes
