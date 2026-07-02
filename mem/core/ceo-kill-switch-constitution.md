---
name: CEO Kill Switch Constitution
description: Highest-authority production law. If the anonymous Golden Customer cannot buy, Genesis blocks all non-safe deployments/migrations until fixed. Extends Zero-Regression Constitution; no duplicates.
type: constraint
---

# CEO Kill Switch Constitution

The anonymous first-time customer is the supreme authority. Technical health
does not equal business health.

## State machine (`public.ceo_kill_switch_state`)
- `clear` — Golden Customer PASS, deployments allowed.
- `degraded` — Golden Customer WARNING or unknown, deployments allowed with caution, Certificate flagged.
- `tripped` — Golden Customer FAIL, standard deployments/migrations BLOCKED.
- `hotfix_override` — manual admin override on `/admin/production-safety`, deployments allowed.

## Enforcement
- Deployment gate SQL: `public.ceo_kill_switch_gate(p_deployment_kind)` (SECURITY DEFINER).
- CI gate script: `scripts/genesis-golden-customer.mjs` — reads `DEPLOYMENT_KIND` env, calls the gate, then runs the Golden Customer. Exit 1 blocks deploy.
- Safe exceptions (always allowed): `hotfix`, `rollback`, `diagnostics`, `monitoring`, `evidence`, `production_validation`.

## Auto-trip / auto-clear
- `genesis-golden-customer` edge function trips the switch on FAIL, flags DEGRADED on WARNING, clears on PASS (unless `hotfix_override` is active).
- Every run publishes a `ceo_production_certificates` row (SHA-256, confidence, journey/checkout/stripe/revenue/regression flags).
- Every state change writes to `ceo_kill_switch_events`.

## Admin surface
- `/admin/production-safety` displays: Kill Switch card, latest CEO Certificate, Golden runs history, per-check evidence. This is the only surface; do not build parallel dashboards.

## Do not
- Do not add a second kill switch or second certification pipeline.
- Do not allow standard deployments while status is `tripped`.
- Do not clear the switch by any path other than a PASSing Golden Customer run or an explicit admin override.
- Do not lower Golden Customer thresholds without a linked P0 incident and war-room approval.