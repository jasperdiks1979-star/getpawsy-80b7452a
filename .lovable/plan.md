
# GENESIS V14 — Financial Evidence Vault

Additive platform on top of the existing V11.1 Evidence Vault, V12 Finance Intelligence, V12.1 Health, V12.2 Manual Import, V12.3 Belastingdienst Export, V13 CEO Command Center, and `stripe-evidence-import`. Nothing existing is replaced.

Because of the breadth of Sections 1–25, V14 ships in 4 phases. Phase 1 is executed now; Phases 2–4 are queued for subsequent turns so each stays reviewable and the migrations stay small enough to audit.

## Phase 1 (this turn) — Foundation: Assets, Suppliers upgrade, CFO Dashboard shell

**New tables (all `public.*`, RLS admin-only, GRANT to authenticated + service_role):**
- `finance_assets` — id, category (enum: phone/laptop/desktop/tablet/monitor/server/network/printer/furniture/vehicle/camera/audio/storage/dev/other), name, serial, supplier_id → `evidence_suppliers`, purchase_date, purchase_amount_cents, vat_amount_cents, currency, business_usage_pct, depreciation_method (linear/none), depreciation_years, salvage_value_cents, status (active/repair/sold/retired/lost), current_book_value_cents (computed nightly), warranty_until, replacement_expected_at, notes, photos jsonb, metadata jsonb.
- `finance_asset_events` — asset_id, event_type (purchase/repair/warranty_claim/battery/upgrade/resale/replacement/note), event_date, cost_cents, vat_cents, evidence_document_id, supplier_id, notes.
- `finance_asset_documents` — join asset_id ↔ evidence_document_id + role (invoice/receipt/warranty/manual/photo/repair_receipt).
- `finance_alerts` — alert_type (invoice_missing/receipt_missing/payment_missing/duplicate_payment/warranty_expiring/subscription_renewing/price_increase/vat_mismatch/unknown_supplier/asset_incomplete), severity, subject_type, subject_id, message, status (open/ack/resolved), created_at.
- `finance_search_index` — materialised text search over documents/suppliers/assets/subscriptions/payments (`tsvector` GIN).

**Extends existing tables (ADD COLUMN, nullable):**
- `evidence_suppliers`: `health_score smallint`, `risk_score smallint`, `invoice_completeness_pct smallint`, `spend_ytd_cents bigint`, `intelligence jsonb`.
- `finance_subscriptions`: `duplicate_of uuid`, `unused_since date`, `expected_next_invoice_at date`, `missing_invoice_flag boolean`.

**Edge functions:**
- `finance-asset-detect` — post-import hook. Given an `evidence_document_id`, calls Gemini 2.5 Flash to detect if the invoice describes a durable asset (Apple/Dell/camera/etc.). Returns suggested category + prompts.
- `finance-asset-depreciate` — nightly cron; recomputes `current_book_value_cents` for every active asset.
- `finance-alerts-scan` — nightly; produces `finance_alerts` rows for the 10 alert types.
- `finance-search-reindex` — rebuilds `finance_search_index`.

**Frontend:**
- `src/pages/admin/FinancialEvidenceVaultPage.tsx` at `/admin/vault-v14` with tabs: Overview (CFO KPIs), Assets, Suppliers, Subscriptions, Alerts, Search, Timeline. Reuses existing panels from `EvidenceVaultPage` (Manual Import, Stripe Import, Backfill, Belastingdienst Export) via imports — no duplication.
- New components under `src/components/admin/vault-v14/`:
  - `CFOScorecard.tsx` (Section 16 KPIs from `finance_vat_summaries`, `evidence_payments`, `finance_subscriptions`, `finance_assets`).
  - `AssetRegistryPanel.tsx` (list + drawer with timeline of `finance_asset_events`).
  - `AssetIntakeDialog.tsx` (Section 6 assistant: business use %, since when, register-as-asset flow).
  - `AlertsPanel.tsx`.
  - `GlobalFinanceSearch.tsx` (Section 18, hits `finance_search_index`).
- Route registered in `src/App.tsx` under existing `AdminRouteGuard`.

**Backfill (Section 21):** extend `finance-backfill-scan` to also emit asset-candidate tasks (invoices > €200 from hardware suppliers detected by `finance-asset-detect`).

## Phase 2 (next turn) — VAT, Subscription & Supplier Intelligence
- `finance-vat-intelligence` edge fn: flags reverse-charge / EU / non-EU / missing / duplicate VAT per document; feeds `finance_alerts` + a new `finance_vat_flags` table.
- `finance-subscription-intelligence`: duplicate/unused/price-increase detection over `finance_subscriptions` history.
- `finance-supplier-intelligence`: health/risk/completeness scores → writes to `evidence_suppliers` fields added in Phase 1.
- UI: Subscription tab timeline, VAT flags drawer, Supplier profile page.

## Phase 3 — Audit Mode, Belastingdienst Dossiers, Accountant Package, Multi-year
- `finance-audit-package` edge fn: builds immutable ZIP (invoices + receipts + payments + assets + VAT + SHA-256 manifest), stored to `genesis-vault`, registered in `evidence_documents` with `is_audit_package = true`.
- Extends `finance-belastingdienst-export` to include asset register + supplier register + timeline JSON.
- `finance-accountant-package` fn (Section 15): CSV registers (expense / invoice / asset / VAT / supplier) + evidence ZIP.
- `finance_annual_dossiers` gains `asset_register_url`, `supplier_register_url`, `audit_package_url`. Nightly cron ensures a dossier row exists for every completed year and the current YTD.

## Phase 4 — Report Library, Certification, Connectors, Timeline
- `finance_reports_library` view + UI tab that auto-archives every existing Genesis report (Revenue/Pinterest/Stripe/Finance/Tax/Infra/Analytics/Evidence/Certification) into `evidence_documents` with `report_category`.
- Financial Timeline view (Section 19) reading `evidence_timeline` + `finance_asset_events` + `evidence_payments` + `finance_subscriptions` renewals.
- Connector framework registry table `finance_connectors_catalog` describing which providers auto-import vs manual-only (Lovable, OpenAI, Stripe ✓ auto; Apple, Meta, Pinterest, TikTok, CJ, Cloudflare, GitHub, domain hosts → guided manual upload). No scraping of unsupported services.
- `GENESIS V14 Certification` generator (PDF via existing pdf skill): Financial Health, Accounting Completeness, Invoice Completeness, VAT Readiness, Asset Completeness, Audit Readiness, Belastingdienst Readiness, Evidence Integrity, Automation, Security, Overall Score, SHA-256 fingerprint. Stored in `genesis_documents` and shown in `/admin/vault-v14` header.

## Guardrails
- All new tables: `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated; GRANT ALL ... TO service_role;` + `ENABLE ROW LEVEL SECURITY` + admin-only policies via `has_role(auth.uid(),'admin')`.
- All new edge functions: `admin-guard.ts`, CORS, zod input validation, SHA-256 on every persisted artifact, idempotent `registerDoc` reuse.
- Zero changes to existing routes, tables, or edge functions beyond additive columns.
- No fabricated data anywhere; missing evidence surfaces as a `finance_alerts` row.

## Deliverable of this turn
Phase 1 fully shipped and reachable at `/admin/vault-v14`, alerts + assets + CFO scorecard live, nightly crons scheduled, backfill extended. Phases 2–4 wait for your go-ahead so each ships with its own reviewable migration + code batch.
