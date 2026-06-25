# Wave 6 — Autonomous Commander AI

The Commander sits **above** every existing AGP/ACI/Pinterest/Cinematic/CPE engine. It does not replace them — it decides which one runs, when, on which model, with which budget, and validates the outcome. Default mode is `simulation` so nothing autonomous reaches production until you flip the switch.

## Architecture (one orchestrator, many decisions)

```text
                       ┌────────────────────────────┐
                       │  Commander AI (this wave)  │
                       │  - goal engine             │
                       │  - model router            │
                       │  - budget engine           │
                       │  - resource scheduler      │
                       │  - decision engine         │
                       │  - simulation engine       │
                       │  - self-healing            │
                       │  - business memory         │
                       └─────────────┬──────────────┘
                                     │ supervises + decides
   ┌─────────────────────────────────┼─────────────────────────────────┐
   ▼                                 ▼                                 ▼
AGP (4A/4A+)     ACI (5X)     Pinterest engines     CPE / Media     Cinematic V3
Growth/Forecast  Opportunity  Autopilot/Scaling     Enhancer/QA     Renderer
SEO / Content    Recs/Tasks   Catalog/Boards        CJ Pipeline     Voiceover
Revenue Intel    Forecasts    Pin Repair            Image Compliance
```

Commander never bypasses existing guardrails (ACI kill switch, Pinterest credit governor, CPE budget caps, cinematic dispatch). It calls each engine's documented entrypoint and respects its `simulation/auto/approval` modes.

## 5-stage rollout

| Stage | Scope | Mode |
|---|---|---|
| **6A — Foundations + War Room** *(this turn)* | Schema, orchestrator skeleton (8 modules), `/admin/commander`, kill switch, cron, simulation run, report | simulation |
| **6B — Model Router + Budget Engine** | Score & route LOVABLE_AI model choice per task by quality/cost/latency history; daily/hourly/weekly/monthly budget ledger across AI/cloud/Pinterest/ads; auto-pause on breach | simulation |
| **6C — Goal Engine + Decision Engine + Simulation** | Operator-defined goals (revenue, ROI, AOV, cost reduction); recommendation evaluator (execute/approve/delay/cancel/retry/escalate); ROI simulation gate before expensive jobs | approval |
| **6D — Self-Healing + Business Memory** | Stalled-cron/edge-fn/RLS/Pinterest/CJ detectors with auto-retry & rollback; long-term memory of winning products/titles/images/prompts/models | approval → auto |
| **6E — Digital Board Meeting + Master Report** | Daily 06:00 UTC CEO PDF (executive/revenue/growth/Pinterest/ads/SEO/media/inventory/trend/competitor/risk + action plan); full Wave-6 master PDF | auto |

Each stage ends with its own PDF+JSON in `public/admin-reports/ai-implementation/` and a manifest entry.

## Stage 6A — what ships this turn

**Database (new tables, RLS admin-read / service-role-write):**

- `cmdr_settings` — kill_switch, mode, autonomy_level, default model, budget caps, goal pointers
- `cmdr_goals` — operator goals (metric, target, horizon, weight, status)
- `cmdr_runs` / `cmdr_run_steps` — execution log per Commander tick
- `cmdr_decisions` — every decision with reasoning, confidence, expected ROI, cost estimate, target engine, status, execution history
- `cmdr_resource_plan` — daily plan: which engine, when, how many calls, expected cost
- `cmdr_model_route_log` — model-router choices (task, candidates, chosen, reason, latency, cost)
- `cmdr_budget_ledger` — multi-period (hour/day/week/month/year) spend by category
- `cmdr_health_signals` — per-engine health snapshots (status, last_run, lag, error_rate)
- `cmdr_simulations` — pre-execution simulation outputs (expected ROI vs threshold)
- `cmdr_memory` — long-term wins/losses keyed by entity (product, title, image, prompt, model)
- `cmdr_audit_log` — append-only audit of every autonomous or operator action

**Edge function:** `cmdr-orchestrator` (single function, 8 internal modules: health-scan → goal-eval → resource-plan → model-router → budget-check → decision-engine → simulation → self-healing). Modes: `manual`, `semi`, `auto`, `autonomous`, `experimental`, `dry_run`, `emergency_stop`. Default `simulation`.

**Cron:** daily 04:00 UTC (after AGP 02:00/02:30/02:45 and ACI 03:30).

**UI:** `/admin/commander` — Executive War Room with live tiles (Business Health, Revenue, Profit, Forecast, AI/Cloud Spend, ROI, Growth, Pending Decisions, Running Jobs, Budgets, Forecast Accuracy, Model Performance, Operator Overrides, System Health) + tabs for Decisions, Resource Plan, Goals, Model Routing, Budgets, Health Signals, Memory, Audit. Operator controls for mode + kill switch + autonomy level.

**Reporting:** PDF + JSON report describing Stage 6A; manifest updated.

**Safety defaults:**

- mode = `simulation` (no engine is invoked; only plans + audit rows written)
- autonomy_level = 1 (every non-trivial decision requires approval once mode advances)
- All daily budgets = $0.01 AI / $0.01 cloud for Commander itself (it doesn't spend; downstream engines retain their own budgets)
- Kill switch primed in UI; flipping it blocks the orchestrator and all auto-execution

**Non-goals for 6A:** no real engine invocation, no model fan-out, no autonomous Pinterest/ads spend, no rollback execution — those land in 6B/6C/6D under approval mode.

## Validation for 6A

- Run `cmdr-orchestrator` once in simulation; expect 8 ok steps, 0 cost, plans + decisions written, no downstream side effects.
- War Room renders all panels with live data.
- Report PDF + JSON exist; manifest contains the new entry.

Approve and I'll execute 6A in this turn, then await your go-ahead for 6B.