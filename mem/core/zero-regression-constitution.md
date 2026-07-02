---
name: Genesis Zero-Regression Constitution
description: Supreme production-safety law. No deployment reaches production if the anonymous Golden Customer journey is broken. Extends Genesis; no duplicate systems.
type: constraint
---

# Zero-Regression Constitution

The anonymous customer experience is the highest authority. If a real anonymous
visitor cannot browse products and complete checkout, the deployment is FAILED
regardless of how many internal tests pass.

## Non-negotiable rules
- The Golden Customer runs with **no login, no cookies, no admin, no service_role**.
- Every deployment MUST pass `scripts/genesis-golden-customer.mjs` (CI gate) — blocks on failure.
- Every migration touching `products`, `products_public`, RLS, policies, grants, views, `security_invoker`/`security_definer`, triggers, or functions MUST trigger a Golden Customer run and record the verdict in `genesis_rls_migration_audit`.
- Anonymous thresholds: products >= 50, dog >= 5, cat >= 5, search >= 1 (thresholds live in `supabase/functions/genesis-golden-customer/index.ts`).
- The `genesis-golden-customer` edge function runs every 5 minutes via `pg_cron` (`genesis-golden-customer-5min`).
- Full evidence (SHA-256, view/policy checksum, totals, journey/RLS/checkout flags) is written to `genesis_golden_runs` + `genesis_golden_checks`.
- Admin dashboard: `/admin/production-safety` (Production Safety Certification). Extends `/admin/production-validation` — do not duplicate.

## Do not
- Do not build a parallel monitoring dashboard.
- Do not use admin or service_role credentials in any anonymous validation path.
- Do not lower thresholds without a linked incident + war-room approval.
- Do not remove or bypass the CI gate — regressions have historically slipped past admin-only checks.