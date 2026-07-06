# Finance Commander — Canonical State Engine Refactor

Goal: eliminate every remaining contradiction (Tax Readiness 67% vs Belastingdienst 100%; KPI 29 missing vs Tax 18 missing; supplier confidence 29% vs 100%; raw reconciliation JSON; desktop tables on mobile) by making every Finance panel a pure view over one canonical state object.

Strictly scoped to Finance Commander. No changes to Pinterest, Creative Factory, Analytics, GA4, Sales Commander, Organic Intelligence, Growth Lab, Checkout, Stripe flow, CJ, or DB schemas.

## Architecture

```text
edge fns (finance-kpi-strip, finance-tax-readiness,
finance-belastingdienst, finance-health-signals,
finance-supplier-*, finance-reconcile-*, …)
                │
                ▼
   useCanonicalFinanceState()  ◄── single React hook
                │  (merges + reconciles all sources,
                │   runs Contradiction Detector,
                │   produces one FinanceState object)
                ▼
   FinanceStateProvider (Context)
                │
   ┌────────────┼─────────────┬─────────────┬────────────┐
   ▼            ▼             ▼             ▼            ▼
 KPI Strip  Tax Readiness  Belasting-   Health       Supplier
                           dienst       Signals      panels
   (pure presentation — no fetches, no math, no status logic)
```

## Deliverables

### New files
- `src/lib/finance/state/types.ts` — `FinanceState`, `FinanceStatus` union (`Verified | Estimated | Needs Review | Missing Evidence | Pending | Waiting Evidence | No Activity | Not Applicable | Unknown`), metric envelopes `{value, status, explanation, sources[]}`.
- `src/lib/finance/state/statusEngine.ts` — single `resolveStatus(metric, ctx)` function. Only place status is computed.
- `src/lib/finance/state/reconcile.ts` — merges raw edge-fn payloads into one canonical object. Picks the **single** authoritative source per metric (e.g. `missing_invoices` = tax-readiness result; KPI + Health + Belastingdienst all consume that number). Downgrades any dependent metric that outranks its base (Belastingdienst ≤ Tax Readiness; VAT-refund confidence ≤ evidence confidence; supplier confidence ≤ doc confidence).
- `src/lib/finance/state/contradictionDetector.ts` — asserts invariants; returns `Contradiction[]`. Verified is blocked whenever any invariant fails.
- `src/lib/finance/state/useCanonicalFinanceState.ts` + `FinanceStateProvider.tsx` — one fetcher, one context. All panels consume via `useFinanceState()` / selectors.
- `src/lib/finance/state/explain.ts` — turns raw signals (recon scores, supplier learning inputs) into CFO-readable bullet lists.
- `src/components/admin/finance/shared/ResponsiveTable.tsx` — table on desktop, stacked cards on mobile. Used by every list panel.
- `src/components/admin/finance/shared/StatusBadge.tsx`, `MetricCell.tsx`, `ExplainPopover.tsx`.
- `src/components/admin/finance/shared/ContradictionBanner.tsx` — surfaces detector output at top of Finance Commander page.

### Edits (presentation-only, no local math)
- `FinanceCommanderPage.tsx` — wrap in `FinanceStateProvider`; render `ContradictionBanner`.
- `FinanceKpiStripPanel.tsx`, `TaxReadinessPanel.tsx`, `BelastingdienstReadinessPanel.tsx`, `OpenFinanceTasksPanel.tsx`, `ForensicDocumentsPanel.tsx`, `SupplierProfilesPanel.tsx`, `SupplierIntelligencePanel.tsx`, `ReconciliationCenterPanel.tsx`, `VatRefundEstimatorPanel.tsx`, plus Health Signals / Imports / Exports / Developer panels — strip local fetches + status logic, read from `useFinanceState()`, adopt `ResponsiveTable` + `StatusBadge` + `MetricCell`.
- Reconciliation panel — hide raw JSON/scores; show `Exact Match / Strong Match / Needs Review` + ticked criteria + "N candidates evaluated".
- Supplier Intelligence — every % has an `ExplainPopover` listing the inputs (invoices analysed, extraction quality, classification confidence, learning progress).
- Document rows — show pipeline stage badge (`Uploaded → OCR → Extraction → VAT → Supplier → Verified`) instead of bare "Invoice date missing".

### Backend (backward-compatible only, no schema change)
- New edge fn `finance-canonical-state` that fan-outs to existing fns server-side, applies the same reconcile logic, and returns one payload. Frontend prefers this; falls back to per-panel fns if it errors. No existing endpoint removed.
- Reuses existing tables. No migrations.

### Self-healing
- Add lightweight `finance-canonical-state` trigger call after any of: manual upload success, Stripe receipt ingest, bank txn import, supplier invoice arrival — already-existing edge fns are invoked in a fixed order (OCR → extraction → VAT classify → supplier learn → reconcile → refund estimate). No new schedules.

### Enterprise validation
- `src/lib/finance/state/__tests__/contradictionDetector.test.ts` — vitest asserting each invariant.
- CI-runnable script `scripts/finance-consistency-check.mjs` invoking `finance-canonical-state` and failing on any contradiction.

## Invariants enforced by detector
1. `belastingdienst.status = Verified` ⇒ `missing_invoices = 0 ∧ missing_receipts = 0 ∧ unmatched_payments = 0 ∧ evidence_confidence = 100`.
2. `tax_readiness_pct ≤ finance_readiness_pct`.
3. `vat_refund.confidence ≤ evidence.confidence`.
4. `supplier.confidence ≤ document.confidence`.
5. KPI Strip counts ≡ Tax Readiness counts ≡ Health Signals counts (same field, one source).
6. No metric may show `Verified` while its source `status ∈ {Needs Review, Missing Evidence, Pending, Waiting Evidence}`.

## Mobile
`ResponsiveTable` uses `md:` breakpoint — desktop table, mobile stacked card per row with label/value pairs and an expandable "Details" accordion. Applied to Open Tasks, Forensic Documents, Supplier Profiles/Intelligence, Reconciliation, Imports, Exports, Developer diagnostics.

## Out of scope
Schemas, other subsystems, checkout, Stripe, CJ, Pinterest, GA4, Analytics, Growth. No API removals; only additive endpoint `finance-canonical-state`.

## Success criteria
- One `FinanceState`; every panel imports from the provider.
- Zero panels compute their own status or counts.
- Contradiction Detector returns `[]` on the current dataset; if not, a banner explains what is inconsistent and blocks any `Verified` badge.
- All list panels usable on 375px width with no horizontal scroll.
- Typecheck clean; existing edge fns untouched; no schema migration.
