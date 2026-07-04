# Visitor World Map — Stage 0 Inventory

_Baseline captured 2026-07-04 as reference point for the V2 refactor._

## Single implementation confirmed

`grep` across `src/` and `e2e/` shows exactly one production component:

- `src/components/admin/VisitorWorldMap.tsx` — the only rendered map component.

There is **no separate desktop implementation** to merge. Stage 1 is therefore
a rename + re-export, not a code merge.

## Import sites

- `src/pages/LiveMap.tsx` — full-page admin route `/live-map`.
- `src/pages/Admin.tsx` — lazy import + prefetch, embedded in the admin dashboard grid.

## Related surfaces (must stay in sync via `useAnalyticsTruth`)

- `src/components/admin/CleanAnalyticsPanel.tsx` — canonical KPI panel + CSV/Summary exports.
- `src/components/admin/CanonicalKpiStrip.tsx` — top-of-page KPI strip on `/live-map`.
- `src/components/admin/LiveVisitorInspector.tsx` — live presence inspector drawer.
- `src/components/admin/MapLoadingFallback.tsx` — Suspense fallback.
- `src/hooks/useAnalyticsTruth.ts` — SOLE canonical reader.
- `supabase/functions/analytics-canonical/index.ts` — SOLE canonical writer.

## Test coverage protecting the invariants

- `src/test/visitor-world-map-canonical-features.test.ts` — zero-orphan feature audit, US geo filter, invariant reconciliation.
- `src/test/visitor-world-map-live-presence.test.ts` — live-presence isolation from canonical KPIs.
- `src/test/analytics-truth-parity.test.ts` — Map ↔ CSV ↔ Summary parity.
- `e2e/visitor-world-map-parity.spec.ts` — end-to-end parity assertions.
- `e2e/visitor-world-map-render.spec.ts` — render invariant.
- `.github/workflows/analytics-truth-parity.yml` — hourly + PR live-parity probe.

## Canonical rule (reaffirmed)

- Business KPIs read ONLY from `analytics-canonical` via `useAnalyticsTruth`.
- Live presence (`visitor_activity.last_seen_at`, 120s window) is isolated,
  labelled "Diagnostic only / not canonical", and never flows into KPI totals.
- No new query pipelines may be added by V2 stages.

## Stage 1 plan (executed in same turn as this doc)

Introduce the `VisitorWorldMapV2` symbol as a **thin re-export** of the current
component so downstream code can start migrating imports incrementally without
any behavioural change. Layout/subcomponent split lands in a later stage under
its own review — not as a hidden change here.