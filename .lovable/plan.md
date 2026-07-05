## Phase 0 — Forensic Audit Result (STOP: most of this is already built)

GetPawsy already ships a production Finance Commander subsystem. Building the 14-phase spec from scratch would duplicate hundreds of existing objects and destabilize production. Below is what I found.

### Existing routes (already live under /admin)
- `/admin/finance` → `FinanceIntelligencePage.tsx`
- `/admin/cfo` → `CFOChatPage.tsx`
- `/admin/cfo-reports` → `CFOReportLibraryPage.tsx`
- `/admin/accountant` → `AccountantPortalPage.tsx`
- `/admin/payments` → `AdminPaymentsPage.tsx`

### Existing edge functions (13 finance + stripe pipeline)
`finance-accountant-export`, `finance-alerts-scan`, `finance-anomaly-scan`, `finance-asset-depreciate`, `finance-asset-detect`, `finance-backfill-scan`, `finance-belastingdienst-export`, `finance-cfo-chat`, `finance-cfo-reports`, `finance-manual-import`, `finance-search-reindex`, `finance-v14-1-certify`, `finance-vat-reconcile`, `stripe-evidence-import`, `stripe-webhook`.

### Existing tables (30 finance/evidence/supplier tables)

```text
finance_actions              finance_alerts              finance_annual_dossiers
finance_anomalies            finance_asset_documents     finance_asset_events
finance_assets               finance_backfill_scans      finance_backfill_tasks
finance_connectors           finance_credit_ledger       finance_expense_categories
finance_health_history       finance_health_scores       finance_import_tasks
finance_reports              finance_risk_findings       finance_search_index
finance_subscriptions        finance_vat_reconciliations finance_vat_summaries
evidence_documents (42 cols) evidence_payments           evidence_suppliers
evidence_links               evidence_timeline           evidence_backup_checks
supplier_products            supplier_import_logs        stripe_test_checkout_log
```

### Coverage vs your 14-phase spec

| Spec phase | Status | Notes |
|---|---|---|
| P1 Central schema | DONE | 30 tables, richer than spec |
| P2 Ingestion (PDF/CSV/XLSX/OCR) | DONE | `finance-manual-import` + `import_tasks` + `backfill_tasks` |
| P3 AI classification | DONE | `finance-anomaly-scan`, `finance_expense_categories`, confidence fields present |
| P4 Bank reconciliation | PARTIAL | `finance_backfill_scans` exists; no ING/Revolut parser yet |
| P5 VAT engine | DONE | `finance_vat_reconciliations`, `finance_vat_summaries`, `finance-belastingdienst-export` |
| P6 Asset register | DONE | `finance_assets`, `finance_asset_events`, `finance_asset_documents`, depreciation cron |
| P7 Evidence vault | DONE | Full `evidence_*` family (documents, payments, suppliers, timeline, links, backup checks) |
| P8 Finance AI | DONE | `finance-cfo-chat`, `finance-cfo-reports`, `finance-alerts-scan`, `finance_anomalies` |
| P9 Dashboards | PARTIAL | 5 pages exist; no unified "Finance Commander" landing that composes them |
| P10 GetPawsy integration | PARTIAL | Stripe wired; Pinterest/TikTok/GA4 cost joins not wired to finance |
| P11 Import wizards | PARTIAL | Generic importer exists; per-source parsers (ING/Revolut/Odido/Apple) missing |
| P12 Safety | DONE | Soft-delete / audit / version fields present on existing tables |
| P13 Performance | DONE | `finance_search_index` + reindex function |
| P14 Certification | DONE | `finance-v14-1-certify` |

### Gaps to close (this plan only builds these)

1. **Multi-entity readiness** — add nullable `entity_id uuid` + `entities` table + backfill default `Skidzo`. No breaking changes.
2. **`finance` app_role** — extend `app_role` enum, update `AccountantPortalPage`/`FinanceIntelligencePage`/`CFOChatPage`/`CFOReportLibraryPage`/`AdminPaymentsPage` guards to accept `admin OR finance`.
3. **Bank statement parsers** — new edge function `finance-bank-parse` (ING + Revolut PDF/CSV auto-detect) writing into existing `finance_import_tasks` → `evidence_payments`.
4. **Vendor-specific invoice adapters** — extend `finance-manual-import` with adapters for Odido, Apple/Amac, Lovable, OpenAI, Shopify, CJ (patterns only; document schema stays).
5. **Finance Commander landing page** — new `/admin/finance-commander` composing existing widgets (KPIs from `finance_health_scores`, alerts from `finance_alerts`, VAT quarter from `finance_vat_summaries`, cash flow from `evidence_payments`, missing-evidence tiles). No duplicate data pipelines.
6. **Cost joins for ROI/ROAS/CAC** — SQL view `v_finance_channel_roi` joining `finance_expense_categories` × `orders` × existing Pinterest/TikTok/GA4 daily rollups. Consumed by Finance Commander.

### What I will NOT do
- Recreate any `finance_*` or `evidence_*` table.
- Duplicate `finance-cfo-*`, `finance-vat-reconcile`, `finance-anomaly-scan`, `finance-belastingdienst-export`, `stripe-evidence-import`, `stripe-webhook`.
- Touch Sales Commander, Organic Intelligence, Analytics Gold Standard, Visitor World Map, Pinterest, Creative Factory, CJ, Growth Lab, Funnel Health, GA4 canonical events, production validation.

### Delivery order (one integrated wave, per your instruction)

1. Migration: `entities` table + `entity_id` nullable everywhere on finance/evidence tables + `finance` role in `app_role` enum + `has_finance_access(uid)` security-definer function.
2. Guard update: 5 finance pages switch to `has_finance_access`.
3. Edge function: `finance-bank-parse` (ING + Revolut).
4. Edge function extension: adapter registry inside `finance-manual-import` for Odido/Apple/Lovable/OpenAI/Shopify/CJ (invoked automatically by supplier detection).
5. SQL view: `v_finance_channel_roi`.
6. New page: `/admin/finance-commander` composing existing hooks + new ROI view.
7. Nav link + route registration.
8. Validation: reuse `finance-v14-1-certify` to certify the extended surface.

### Manual actions I will need from you afterward
- Upload the invoice ZIP from the previous mission (Lovable/Stripe PDFs).
- Upload ING + Revolut statements (PDF or CSV).
- Grant your accountant the new `finance` role via `/admin/users`.

Approve this plan and I will implement steps 1–8 in one integrated build. Reject and tell me what to change (e.g. drop multi-entity, keep single guard, add more parsers).