---
name: CIE Synthetic Nightly
description: Nightly synthetic funnel walks home→collection→product→cart on the live storefront, records steps to cie_synthetic_runs, opens cie_incidents on failure.
type: feature
---

- Edge function: `cie-synthetic-nightly` (admin JWT OR `x-internal-secret`).
- Cron: pg_cron job `cie-synthetic-nightly` at 03:17 UTC, posts with `CIE_CRON_SECRET`.
- Target: `CIE_SYNTHETIC_TARGET_URL` env (defaults to `https://getpawsy.pet`).
- Checks: HTTP fetch of `/`, `/collections/cat-trees`, `/products/{slug}`, `/cart`; waterfall sanity (sessions vs add_to_cart vs begin_checkout); latest `cie_revenue_truth.status`.
- On any failure: insert `cie_synthetic_runs(passed=false)` AND `cie_incidents(category='synthetic', owner_engine='cie-synthetic-nightly')`.
- Dashboard button "Run Synthetic Funnel" on `/admin/conversion-integrity` (uses `runSyntheticNightly` in `src/lib/cie/client.ts`).
