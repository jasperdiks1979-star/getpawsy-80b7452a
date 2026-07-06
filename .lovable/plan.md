# Finance Commander Intelligence Engine — Delivery Plan

This is a 14-phase forensic-accounting expansion (~30+ edge functions, ~15 UI panels, schema extensions, VAT engine, learning loop, exports). Shipping it in one turn would be irresponsible — it would either be shallow across the board or break existing Finance Commander functionality. I will deliver it in **4 additive waves**, each independently reviewable, typechecked, and reversible. Nothing existing gets rewritten; every table/edge function/UI is additive.

## Guardrails (apply to every wave)
- Zero rewrites of existing Finance Commander code, Pinterest, Organic Intel, Sales Commander, Creative Factory, CJ, Stripe, Analytics, GA4, Funnel Health, Visitor World Map.
- All schema changes are additive columns / new tables with GRANTs + RLS + `has_finance_access`.
- Every enriched field carries `confidence`, `source`, `reasoning` — labels: Verified / Estimated / Needs Review / Missing Evidence.
- No auto tax filing. Ever.
- Every correction writes to a learning table so future OCR/classification improves.
- Idempotent imports (SHA-256 on file + supplier + invoice_number).

## Wave D1 — Forensic Document + VAT Core (Phases 1, 3, 5)
New/extended tables (additive columns on `evidence_documents`, new tables for enrichment):
- Extend `evidence_documents` with: `legal_name, vat_number, kvk, invoice_number, po_number, invoice_date, due_date, payment_date, currency, fx_rate, subtotal_minor, vat_minor, vat_pct, total_minor, reverse_charge, import_vat_minor, non_deductible_vat_minor, recoverable_vat_minor, country, entity_id, payment_method, bookkeeping_category, expense_category, ocr_confidence, extraction_confidence, missing_fields jsonb, validation_state, bookkeeping_readiness, quality_score, quality_reasons jsonb`.
- New table `finance_document_extractions` — versioned raw AI/OCR extractions (never overwritten).
- New table `finance_vat_classifications` — per-document VAT bucket + reasoning.
- New table `finance_invoice_quality` — 15-check forensic score.

Edge functions:
- `finance-forensic-extract` — reads existing OCR + Lovable AI (`google/gemini-3-flash-preview`) → writes enrichment + confidence + missing_fields. Idempotent per document version.
- `finance-vat-classify` — Dutch VAT engine (21/9/0/RC/import/OSS/outside-EU/mixed/private) with per-line reasoning.
- `finance-invoice-quality` — 15-check forensic scorer.

UI (additive):
- `ForensicDocumentDrawer.tsx` — expand row in Import Center / Supplier view to show extraction, VAT classification, quality checks, confidence.
- Extends existing `TaxReadinessPanel` with per-bucket VAT breakdown pulled from `finance_vat_classifications`.

## Wave D2 — Supplier & Subscription Intelligence 2.0 + Reconciliation (Phases 2, 6, 7)
- Extend `evidence_suppliers` with: `expected_layout jsonb, expected_cycle, expected_vat_pct, expected_currency, expected_bookkeeping_category, avg_invoice_minor, yoy_spend_minor, missing_invoice_history int, duplicate_history int, risk_score, learned_patterns jsonb`.
- New table `finance_supplier_memory` — per-supplier learned rules from corrections.
- Extend `finance_subscriptions` with: `cycle_detected, next_expected_at, price_trend, duplicate_of, unused_since, forecast_annual_minor, renewal_risk`.
- Edge functions:
  - `finance-supplier-learn` — recomputes supplier profile from history + corrections.
  - `finance-reconcile-payments` — invoice ↔ bank ↔ Stripe ↔ subscription matching; creates `Missing Invoice`, `Outstanding Payment`, `Duplicate Evidence` items in existing `finance_anomalies`.
  - `finance-subscription-intel` — cycle/duplicate/unused detection + 12-month forecast.
- UI: extend existing `SupplierIntelligencePanel` with drill-down; new `SubscriptionIntelligencePanel.tsx`; new `ReconciliationPanel.tsx`.

## Wave D3 — Belastingdienst Readiness + CFO Insights + KPI Strip + Anomaly Learning (Phases 4, 8, 9, 11, 13, KPI)
- Edge functions:
  - `finance-bookkeeping-classify` — expense classifier with 95% threshold → Needs Review below.
  - `finance-belastingdienst-readiness` — extends readiness with completeness matrix + traffic lights per quarter/entity.
  - `finance-cfo-daily` — writes daily insight snapshot (burn, runway, top savings, refund estimate, risks) to existing `finance_reports`.
  - `finance-vat-refund-estimate` — quarterly/YTD/annual recoverable VAT with assumptions log.
  - Extend `finance-anomaly-scan` with duplicates / VAT / entity / currency / subscription / cost-spike / missing-evidence detectors.
- UI:
  - New `BelastingdienstReadinessPanel.tsx` (green/yellow/red per quarter, per entity).
  - New `CFOInsightsPanel.tsx` (daily insights with reasoning).
  - New `VatRefundEstimatorPanel.tsx` (assumptions visible).
  - New `KpiStrip.tsx` at top of Finance Commander — Recoverable VAT, Outstanding VAT, Next refund estimate, Evidence completeness, Supplier confidence, Avg invoice quality, Duplicate risk, Missing invoices/receipts, Unmatched payments, Tax/Bookkeeping/Accountant readiness, Financial confidence score.

## Wave D4 — Accountant Exports + Learning Loop + Performance Hardening (Phases 10, 12, 14)
- Extend `finance-accountant-export` with export shapes for Exact Online, Moneybird, Twinfield, AFAS, e-Boekhouden (CSV/XLSX/PDF/JSON) + full audit + bookkeeper ZIP package including reconciliation reports.
- New table `finance_corrections_log` — every manual UI edit writes here; `finance-learn-from-corrections` cron promotes stable patterns into supplier memory + classifier weights.
- Performance: extend `finance-manual-import` with a queued worker path (parallel OCR up to N, retry queue, progress rows on `finance_import_tasks`, resumable ZIP expansion, idempotency via SHA-256).
- UI: `AccountantExportCenter.tsx`, "Why did the AI decide this?" panel wired to `reasoning` JSON, correction capture on every editable field.

## Sequencing & Approval
Each wave ends with: typecheck, targeted smoke via Playwright on `/admin/finance-commander`, and a status note. If any wave surfaces an issue in existing behavior, I stop and repair before proceeding.

Reply **"go D1"** (or D1+D2, or all) to start. If you want reordering — e.g. Belastingdienst Readiness before Supplier 2.0 — say so and I'll revise before writing code.
