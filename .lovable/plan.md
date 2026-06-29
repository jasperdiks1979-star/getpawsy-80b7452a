
## Goal

Turn every line of the First Sale Brief into a one-click, audited action — without rebuilding any analytics or duplicating existing engines.

## Scope (this iteration)

In:
1. A single backend action dispatcher that translates "what the brief recommends" into calls against engines we already have.
2. An `autopilot_actions` audit table (the only new table) — records every queued / executed / undone action with confidence, AI-credit estimate, expected revenue impact, status, result.
3. UI in Growth Command Center: each Brief row gets `Execute`, `Preview`, `Undo`, confidence chip, credit cost, revenue-impact estimate, and last-run status.
4. A "Today's autopilot queue" panel ordered by **expected revenue per AI credit**.

Out (explicit non-goals to keep this shippable):
- No new scoring models. Sales priority (CRITICAL/HIGH/MEDIUM/LOW) is derived from existing `gv3_pi_scores.overall_score` + `gv3_pin_growth_scores.classification` + canonical funnel — no new table.
- No new cron. Manual + on-demand only this iteration; daily scheduler comes after we verify dispatch is safe.
- No new creative pipelines. We invoke existing edge functions only (`pinterest-creative-director`, `pcie-v2-creative-director`, `pinterest-growth-run`, `product-intelligence-run`, `pinterest-revenue-brain`).
- No new learning model. Outcomes are written to `autopilot_actions.result` and read back on next ranking; that is the learning loop for v1.

## Action catalog (Phase 1)

Each action = (kind, target_product_id, payload, invokes). All map to existing endpoints:

| Action kind | Invokes (existing) | AI cost est. |
|---|---|---|
| `pin.publish_today` | `pinterest-growth-run` + `pinterest-creative-director` (action=run_full) | 2–4 |
| `pin.regenerate_creative` | `pinterest-creative-director` (force=true) | 2–3 |
| `pin.rewrite_copy` | `pcie-v2-creative-director` (rewrite stage) | <1 |
| `product.promote` | `pinterest-revenue-brain` (auto_promote) | 1 |
| `product.pause` | flip `pinterest_publish_governor` + tag in `gv3_pi_recommendations` | 0 |
| `product.rescore` | `product-intelligence-run` (single product) | <1 |
| `pdp.optimize_plan` | `cro-audit` (existing) + write findings to brief | <1 |

Anything not in this catalog is hidden from the UI (no placeholder buttons).

## Sales priority derivation (Phase 2, no new table)

```
priority = f(
  pi.overall_score,
  pi.confidence_score,
  pin.classification,
  canonical.purchases_24h,
  canonical.atc_rate,
  product.margin_pct,
  product.in_stock,
)
→ CRITICAL  ≥90 score & ≥90 conf & in_stock
→ HIGH      ≥80 score & ≥80 conf
→ MEDIUM    ≥60
→ LOW       else
```
Only CRITICAL/HIGH actions are allowed to spend AI credits — enforced server-side in the dispatcher, not just the UI.

## Expected revenue per credit (Phase 3)

```
expected_revenue = aov_eur
  × baseline_cvr
  × predicted_lift(action_kind, pi_score, pin_score)
  × expected_sessions_24_72h
roi = expected_revenue / ai_credit_cost
```
`predicted_lift` table is a flat constant map shipped in code (e.g. `regenerate_creative` on score≥85 → +12%) — honest heuristic, clearly labeled "v1 heuristic, refined by outcome logging in Phase 9". No fake AI confidence scores.

## New table (the only one)

```sql
autopilot_actions (
  id uuid pk,
  kind text,             -- pin.publish_today, pin.regenerate_creative, ...
  product_id uuid,
  priority text,         -- CRITICAL|HIGH|MEDIUM|LOW
  confidence numeric,    -- 0..1 (derived, not invented)
  ai_credit_cost numeric,
  expected_revenue_eur numeric,
  expected_roi numeric,
  status text,           -- queued|running|done|failed|undone
  invoked_function text,
  invocation_payload jsonb,
  invocation_result jsonb,
  outcome_metrics jsonb, -- filled by Phase 9 reader (ctr/atc/checkout deltas)
  created_by uuid,
  created_at timestamptz,
  executed_at timestamptz,
  undone_at timestamptz
)
```
Admin-only RLS, service_role full. GRANTs as required.

## Edge function: `autopilot-dispatch`

Single function, admin JWT required. Endpoints:
- `POST /preview` — returns the resolved action (invoked function, payload, cost, revenue est, ROI) without executing.
- `POST /execute` — inserts row status=running, calls the existing edge function, updates status + result.
- `POST /undo` — best-effort reversal per action kind (pause→unpause; regenerate→mark draft rejected; publish→remove from queue if still queued).
- `GET /today` — returns today's ranked queue (CRITICAL/HIGH only) sorted by expected revenue per credit.

All it does is orchestrate existing functions. No new business logic lives here beyond ranking + credit gating.

## UI changes

`GrowthCommandCenterPage.tsx`:
- First Sale Brief rows: add `Execute`/`Preview`/`Undo` controls + chips (priority, confidence, credits, est. revenue, last status).
- New "Today's autopilot queue" card under the brief: list of queued actions ordered by ROI, with batch execute (CRITICAL only).
- New "Execution history (24h)" card pulling from `autopilot_actions` — status, when, outcome delta if available.

No new pages. No new routes.

## Phase 9 learning loop (this iteration)

Outcome reader = a small SQL view that joins `autopilot_actions` (executed_at) with canonical_events deltas for that product over the next 24h. Read on next ranking, used to nudge `predicted_lift` constants — surfaced as "observed lift vs predicted" column. No retraining, no model. Honest baseline → real lift logging → manual tuning later.

## Out of scope / explicitly deferred

- Cinematic video queueing (already governed by `cinematic_v3_dispatch_queue`; we won't add another path).
- Auto-cron daily execution — added in v3.3 once we trust the dispatcher with manual runs.
- Multi-step "plans" (chains of actions). v1 is one action per row.
- Any UI outside Growth Command Center.

## Why this is safe

- One new table, admin-only.
- One new edge function that only calls existing ones.
- AI-credit gating enforced server-side.
- Every action has Preview + Undo before/after execute.
- All numbers shown to user (confidence, est. revenue, ROI) are derived from real data in PI/Pin Growth/Canonical SDK or labeled "v1 heuristic" — no synthetic scores anywhere.

Approve and I'll ship in this order: migration → dispatcher edge function → GCC UI wiring → smoke test with a single `product.rescore` action end-to-end.
