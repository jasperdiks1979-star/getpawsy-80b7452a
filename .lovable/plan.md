## ACOS Phase 2 — Wave B Activation Plan

Wave A shipped 18 engines + 21 tables in observation mode. This plan wires those decisions into the production queue **behind an approval gate**, adds health/alerting, and ships a verification harness. Autonomous mutations remain **OFF** until the approval flow is verified end-to-end.

### Guardrails (non-negotiable)
- Respect `app_config.global_stop`, `pcie2_publish_enabled`, Guardian gate, CI Layer trigger.
- No direct inserts into `pcie2_publish_queue` from ACOS — all writes go through `pcie2-publish-assembler` (the only CI-stamped path).
- `acos_settings.autonomous_mutations = false` default. Every engine flag defaults OFF.
- All ACOS→queue writes pass through one new dispatcher with a kill switch.

---

### Step 1 — Wire decisions into the queue (behind approval gate)

**New edge function `acos-decision-dispatcher`** — the single chokepoint:
1. Reads pending rows from `acos_decisions` where `status='approved'` AND engine flag enabled.
2. Routes by `decision_type`:
   - `creative_publish` / `creative_refresh` → calls `pcie2-publish-assembler` (CI-stamped, Guardian-gated).
   - `pin_seo_variant` → writes to `acos_pin_seo_variants` (observation table, no publish).
   - `ads_recommendation`, `board_action`, `landing_audit` → recorded only, surfaced in Command Center.
3. Idempotency via `acos_decisions.dispatched_at` + `dispatch_idempotency_key`.
4. Writes `acos_decisions.execution_result` and `acos_orchestrator_steps` row.
5. Hard checks before any dispatch: global_stop, pcie2_publish_enabled, engine flag, approval status, rate limit.

**Engines updated to write decisions (not actions):**
- `acos-revenue-brain`, `acos-score-engine`, `acos-winner-detect`, `acos-loser-detect`, `acos-creative-families`, `acos-creative-fatigue`, `acos-pin-seo-ai`, `acos-commander-ai`, `acos-orchestrator` all emit rows into `acos_decisions` with `status='pending_approval'` (or `auto_approved` once Wave C lands).
- Existing observation rows in `acos_*_signals` tables remain untouched.

**Schema additions** (migration):
- `acos_decisions`: add `dispatch_idempotency_key`, `dispatched_at`, `execution_result jsonb`, `approval_required boolean default true`, `approved_by`, `approved_at`, `rejected_reason`.
- `acos_settings`: add `approval_mode text default 'manual'` (`manual` | `auto_low_risk` | `auto`).
- New `acos_dispatch_log` table for every dispatcher invocation.

---

### Step 2 — Integration smoke tests

**New edge function `acos-smoke-test`** runs and persists a single report row in `acos_orchestrator_runs` of type `smoke_test`:

| Check | Pass criteria |
|---|---|
| All 18 ACOS functions reachable (HEAD) | 200 |
| 21 ACOS tables: select 1 | no error |
| Orchestrator hourly+nightly steps complete | finished_at set |
| `acos-decision-dispatcher` blocks when `autonomous_mutations=false` | returns `blocked_by_settings` |
| Dispatcher blocks when `global_stop=true` | returns `blocked_global_stop` |
| Dispatcher routes a fake `pin_seo_variant` decision (low risk) | row in `acos_pin_seo_variants` |
| Existing systems intact: Guardian, CI Layer trigger, pcie2 assembler reachable | all 200 |
| Queue write rejected without CI stamps (negative test) | trigger fires |

Auto-fix loop: on failure of a known class (missing GRANT, missing column, stale row), apply known remediation and re-run once. Otherwise mark `failed` and stop.

Report saved to `public/admin-reports/ai-implementation/2026-06-26-acos-wave-b-smoke.{pdf,json}`.

---

### Step 3 — Health, alerting & dashboard

- **`acos-health-watchdog`** (cron every 5 min): probes every engine + dispatcher + queue depth + CI gate trigger + Guardian status → writes `acos_health_snapshots` (new table) and raises `acos_alerts` rows on threshold breach.
- **`acos-alert-notifier`**: routes alerts to existing `guardian_notification_queue` (reuses ops channel) — no new transport.
- **Dashboard:** new tab in `/admin/command-center-2` → "System Health" — shows per-engine status pill, last-run age, last-error, queue depth, dispatcher status, kill-switch state, recent alerts feed.

New tables (migration): `acos_health_snapshots`, `acos_alerts`, `acos_dispatch_log`.

---

### Step 4 — Wave B approval flow

- **UI:** new tab "Approvals" in `/admin/command-center-2` listing `acos_decisions` where `status='pending_approval'` — shows decision payload, risk score, source engine, predicted impact, and **Approve / Reject / Approve+Auto-future** actions.
- **Approve** flips `status='approved'`, sets `approved_by/at`; dispatcher picks it up on next tick.
- **Reject** sets `status='rejected'` + reason; engine learns via `acos_learning_insights`.
- **Auto-future** writes a rule into `acos_score_weights` so similar low-risk decisions skip approval next time (only when admin opts in per engine).
- **Default state:** `approval_mode='manual'`, `autonomous_mutations=false`. Nothing dispatches until an admin clicks Approve.

---

### Gate after each step
After each of steps 1–4: generate validation report (`.pdf`+`.json`+manifest update), verify GREEN, then proceed. Stop and surface on RED.

### Not in scope (deferred)
- Auto-tuning weights from outcomes (Wave C).
- Enabling any engine flag to ON (user toggles after reviewing approvals UI).
- Any change to OAuth, Publisher, Guardian, CI Layer, Publish Assembler, Global Stop, Canary, Recovery, Evolution Engine, existing crons.

Ready to execute step 1 on approval.
