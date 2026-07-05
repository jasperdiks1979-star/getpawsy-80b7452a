## Finance Commander Phase 2.5 — Production Hardening Plan

Given the scope (11 workstreams, ~4k lines of existing finance code), I'll deliver this in **3 sequenced waves** rather than one 20+ file blast. This keeps each wave reviewable, testable, and reversible, and lets you approve direction before we invest in the next wave.

Existing surface we will reuse (no rebuilds):
- Edge functions: `finance-bank-parse`, `finance-manual-import`, `finance-vat-reconcile`, `finance-anomaly-scan`, `finance-alerts-scan`, `finance-backfill-scan`, `finance-cfo-chat`, `finance-cfo-reports`, `finance-accountant-export`, `finance-belastingdienst-export`, `finance-v14-1-certify`, `finance-asset-*`, `finance-search-reindex`
- Tables: `finance_entities`, `evidence_documents/suppliers/payments/timeline`, `finance_import_tasks`, `finance_vat_summaries/reconciliations`, `finance_health_scores/history`, `finance_anomalies`, `finance_alerts`, `finance_subscriptions`, `finance_assets`, `finance_reports`
- UI: `FinanceCommanderPage.tsx`, `FinanceIngestionPanel.tsx`, existing `CFOChatPage`, `CFOReportLibraryPage`, `AccountantPortalPage`

### Wave A — Foundations (this turn if approved)
1. **Entity picker upgrade** — new `EntitySelector` reading `finance_entities` (legal name, brand, VAT, KVK, base currency, fiscal year, country). Never render `entity_id`. Wire into `FinanceCommanderPage`.
2. **Health 2.0 edge function** — new `finance-health-score` computing weighted score across the 13 signals listed, writing to existing `finance_health_scores`/`finance_health_history` with per-category breakdown + reasoning JSON. Replace current simple score consumer.
3. **Tax Readiness Center panel** — new `TaxReadinessPanel.tsx` powered by existing `finance-vat-reconcile` + a thin new `finance-tax-readiness` aggregator (invoices/tx matched, recoverable/reverse-charge/import/non-deductible VAT, missing evidence, readiness %, traffic lights).
4. **Import Center v2** — extend `FinanceIngestionPanel` in place: batch progress, ETA, per-file detected metadata (supplier/VAT/entity/country/duplicate), retry failed, cancel, filter/search, import history table backed by `evidence_documents` + `finance_import_tasks`.

### Wave B — Intelligence
5. **Supplier Intelligence view** — new `SupplierIntelligencePanel.tsx` (aggregations from `evidence_suppliers/documents/payments`), alias consolidation via the existing supplier adapter registry in `finance-manual-import`.
6. **Channel Cost Intelligence** — extend existing Channel ROI: add Pinterest/TikTok/Meta/Google/Organic/Stripe/Shopify/CJ/Hosting/AI/Software/Infra buckets; compute ROAS, ROI, CAC, cost/order, cost/sale, cost/visitor using existing analytics tables.
7. **CFO Dashboard** — new `CFODashboardPanel.tsx` (monthly rev/exp/profit, margin, burn, runway, top suppliers/subs/marketing/AI/infra spend, top expense growth). Reuse `finance-cfo-reports`.
8. **Finance AI monitors** — schedule existing `finance-anomaly-scan` + `finance-alerts-scan` on cron, add explainable reasoning column; new detectors for: subs w/o invoices, invoices w/o payment, payments w/o invoice, private-expense candidates, confidence-below-threshold.

### Wave C — Exports, Mobile, Certification
9. **Bookkeeping export bundle** — extend `finance-accountant-export` to emit Quarter/Annual VAT, GL, supplier/expense/subscription overviews, asset register, outstanding evidence, missing invoices, bookkeeper ZIP package in Excel/CSV/PDF/JSON.
10. **Mobile optimization pass** — responsive grid, collapsible KPI cards, touch upload, no horizontal scroll on all Finance Commander panels.
11. **Certification** — run `finance-v14-1-certify`, produce Finance Commander Certification, Tax Readiness, and Production Readiness PDFs + JSON under `public/admin-reports/ai-implementation/` per the standing report rule.

### Guarantees
- Zero rebuilds; every new function/table is additive.
- Verified / Estimated / Needs Review / Missing Evidence labels enforced across new UI.
- Entity isolation via existing `has_finance_access` RPC + `entity_id` scoping in all queries.
- No auto tax filing.

### Approval needed
Reply **"go wave A"** (or A+B, or all) and I'll ship. If you want to reorder or drop anything, tell me and I'll revise before touching code.
