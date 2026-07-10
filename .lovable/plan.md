## GetPawsy → Shopify Migration Commander V1.0 — Enterprise Blueprint

**Mode:** Read-only planning. No code, no migrations, no Shopify resources created until owner Go/No-Go.

**Scope boundary (immutable):** Shopify replaces ONLY storefront, catalog, checkout, cart, customer accounts, orders, payments, collections. Everything else — Pinterest Enterprise, PCIE2/3, Creative Factory, Growth Commander, Organic Intelligence, Revenue AI, Canonical Analytics, CJ Intelligence, AI Recovery, Render Worker, Supabase intelligence layer, all enterprise dashboards — remains untouched and continues to operate against the same Supabase backend. Shopify becomes a **data source** that mirrors into Supabase (canonical_products, canonical_orders) so the AI stack keeps functioning without rewrites.

---

### 1. Dependency Graph (canonical ownership after cutover)

```text
                    ┌────────────────────────────────────────┐
                    │       SHOPIFY (Commerce Engine)         │
                    │  Products · Variants · Inventory        │
                    │  Collections · Cart · Checkout          │
                    │  Customers · Orders · Payments · Pages  │
                    └───────┬──────────────────────┬──────────┘
                            │ Admin GraphQL 2025-01 │ Webhooks (HMAC)
                            ▼                       ▼
        ┌───────────────────────────────────────────────────────┐
        │  shopify-sync edge functions (NEW, additive)          │
        │  - shopify-webhook (products/orders/customers/inv)    │
        │  - shopify-product-mirror  → canonical_products       │
        │  - shopify-order-mirror    → canonical_orders/orders  │
        │  - shopify-inventory-sync  ↔ CJ                       │
        │  - shopify-catalog-feed    → Pinterest / GMC          │
        └───────────────────────────┬───────────────────────────┘
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │        SUPABASE (Intelligence Layer — UNCHANGED)      │
        │  PCIE2/3 · Creative Factory · Growth Commander        │
        │  Pinterest Enterprise · Revenue AI · Organic Intel    │
        │  CJ Intelligence · AI Recovery · Render Worker        │
        │  Canonical Analytics · 897 edge functions · ~200 cron │
        └───────────────────────────────────────────────────────┘
                                    ▲
                                    │ read-only mirror
                    ┌───────────────┴───────────────┐
                    │  Pinterest · GA4 · GSC · Meta │
                    │  TikTok · CJ Dropshipping     │
                    └───────────────────────────────┘
```

Key contract: **canonical_products / canonical_orders keep their current shape.** The mirror functions translate Shopify GID → existing UUID via a new `shopify_id_map` table. No AI code changes required.

---

### 2. Forensic Inventory Snapshot (from prior Phase 0 audit)

| Domain | Count | Migration action |
|---|---:|---|
| Products (public site) | 306 live / 774 rows | Export → Shopify Products (GraphQL bulk) |
| Collections | 5 | Recreate as Shopify custom + smart collections |
| Guides | 304 | Shopify Pages (or keep on Lovable subdomain, canonical to Shopify) |
| Blog posts | 33 | Shopify Blog articles |
| Static pages | 14 | Shopify Pages (policies, about, contact) |
| Lifetime orders | 38 | Historical: mirror into Shopify Orders (draft, no re-charge) |
| Abandoned carts | 307 | Not migrated (Shopify starts fresh) |
| Customers | ~from orders | Optional; requires consent audit |
| Edge functions | 897 | ~12 commerce funcs deprecated; rest untouched |
| Cron jobs | ~200 | Unchanged; add 3 new (mirror, feed, reconcile) |
| Pinterest destinations | 662 sitemap URLs | 301 redirect map required |
| CJ mappings | in `cj_sync_items` (9,187) | Rewire via new `shopify-inventory-sync` |
| Public tables | 1,512 | Zero drops; add ~4 (`shopify_id_map`, `shopify_webhook_events`, `shopify_migration_jobs`, `shopify_migration_audit`) |

---

### 3. Wave-by-Wave Roadmap

| Wave | Name | Duration | Destructive? | Owner action needed |
|---|---|---|---|---|
| **W0** | Owner prerequisites | 1–3 days | No | Yes (see §7) |
| **W1** | Read-only foundation: Shopify enable, dev store, `shopify_id_map`, Admin GraphQL client, webhook receiver, Migration Commander dashboard skeleton | 2 days | No | None |
| **W2** | Product migration (dry-run → staged → live) with Diff/Validation/Conflict reports; images uploaded to Shopify Files | 3 days | No | Review diff report |
| **W3** | Collections + navigation + smart-collection rules | 1 day | No | None |
| **W4** | Content: blogs, guides, static pages, 301 redirect map generation | 2 days | No | Legal approval on policy pages |
| **W5** | SEO validation gate: canonical, meta, schema, OG, sitemap, redirect 100% pass | 1 day | No | None (auto-gated) |
| **W6** | CJ reconnection via `shopify-inventory-sync` + order-forwarder; duplicate-order guard | 2 days | No | None |
| **W7** | Pinterest catalog rewire (destination URLs → Shopify), Pinterest Tag + CAPI reconfig; existing PCIE2/Creative Factory untouched | 1 day | No | None |
| **W8** | Analytics rewire: GA4, GSC, Meta, TikTok tags on Shopify theme; Canonical Analytics mirror validation | 1 day | No | None |
| **W9** | Premium Shopify theme (Scandinavian, mobile-first, sticky ATC, bundles, reviews, mega menu, CWV budget) — built on dev store | 3–5 days | No | Design review |
| **W10** | Historical order/customer mirror (Shopify Orders API, `financial_status=paid`, `send_receipt=false`) | 1 day | No | Consent decision |
| **W11** | Enterprise Certification suite (14 checks — see §Validation) | 1 day | No | None |
| **W12** | Staging cutover on `staging.getpawsy.pet` — full end-to-end anonymous purchase on Shopify test gateway | 1 day | No | Owner sign-off |
| **W13** | DNS cutover + Shopify Payments activation + go-live | 2 hrs | **Yes (DNS)** | Owner-only |
| **W14** | 14-day rollback window; daily reconciliation reports | 14 days | No | Monitor |

Total working days: ~20–25 (plus W0 prereqs + W14 monitoring).

---

### 4. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Pinterest destination URLs 404 after cutover | **Critical** | Full 301 map generated + validated in W5; block go-live if <100% pass |
| PCIE2 / Creative Factory writes to `products` while Shopify becomes canonical | High | Mirror is one-way (Shopify → Supabase); freeze `products` writes from AI stack, redirect to `canonical_products` read path |
| CJ duplicate orders during transition | High | Idempotency key = `shopify_order_id`; guard in `shopify-order-mirror` |
| Historical 38 orders lost | Medium | Mirror as draft orders with `financial_status=paid`, `fulfillment_status` preserved |
| SEO ranking drop | Medium | 301 redirects + canonical preservation + sitemap swap; monitor GSC daily for 14d |
| Shopify Payments verification delay | Medium | Owner action, parallelised with W1–W11 |
| AI credit spend during migration | Low | Migration itself uses **zero** AI credits (deterministic ETL). Only theme copywriting optional. |
| Render Worker orphaned | Low | Untouched; keeps rendering to Supabase storage; theme reads Shopify CDN + Supabase-hosted creatives |
| Rollback complexity | Medium | DNS TTL 300s pre-cutover; Lovable storefront kept warm on `legacy.getpawsy.pet` for 14 days |

---

### 5. Rollback Strategy

1. **Pre-cutover:** lower DNS TTL to 300s 48h before W13.
2. **Snapshots at every wave:** Supabase logical backup + `shopify_migration_audit` row per mutation.
3. **Dual-run window (W12→W13):** legacy Lovable storefront stays live on `legacy.getpawsy.pet`; Shopify on `shop.getpawsy.pet`; apex flips at W13.
4. **One-click rollback:** flip apex DNS back to Lovable (Cloudflare API call); Shopify remains as read-only mirror; no data loss because Supabase is canonical for intelligence.
5. **14-day retention:** legacy storefront + all Supabase snapshots retained until day 14 post-cutover.
6. **Order-in-flight handling:** during rollback window, new Shopify orders continue to be honoured (Shopify remains open); Lovable storefront is read-only until rollback is finalised.

---

### 6. Migration Commander Workspace (built in W1)

Route: `/admin/shopify-migration`. Sub-panels:

- **Dashboard** — completion %, health score, ETA, live counters
- **Queue** — pending/running/succeeded/failed jobs with resume
- **Health** — webhook lag, sync errors, GraphQL rate-limit headroom
- **Jobs** — per-entity job history with diff download
- **Reports** — Diff, Validation, Conflict, Redirect coverage, SEO parity
- **Certification** — 14-check gate (blocks cutover)
- **Rollback Center** — snapshot list, one-click revert
- **Audit Trail** — immutable `shopify_migration_audit` log

All jobs idempotent, resumable, bounded (rate-limit + retry with jitter).

---

### 7. Owner-Only Actions (blocking)

1. Approve dev-store creation (or provide existing store admin URL).
2. Choose Shopify plan tier (Basic / Shopify / Advanced) — required for Payments activation.
3. Confirm `getpawsy.pet` DNS control (Cloudflare access).
4. Approve Shopify custom-app scopes: `read_products, write_products, read_orders, write_orders, read_customers, write_customers, read_inventory, write_inventory, read_content, write_content, read_files, write_files, read_discounts, write_discounts`.
5. Consent decision on historical customer migration (GDPR/CCPA).
6. Decide CJ integration path: install CJ Shopify app **or** keep custom `create-cj-order` edge function (recommendation: keep custom bridge for continuity with existing `cj_sync_items`).
7. Legal review of policy pages (privacy, terms, refund, shipping).
8. Tax configuration approval (US nexus states, EU VAT if applicable).
9. Shopify Payments verification (owner + Shopify KYC).
10. Final production Go/No-Go at W12.

---

### 8. AI Credit Estimate

| Wave | Credit type | Estimated spend |
|---|---|---|
| W1–W8, W10–W11 | Deterministic ETL, no LLM | **0 credits** |
| W9 (theme copy — optional) | Text generation (Gemini flash) | ~500–1,500 credits |
| W9 (hero imagery — optional, reuse existing PCIE2 assets) | Image gen | **0** (reuse) |
| Certification + monitoring | 0 | **0** |
| **Total worst case** | | **~1,500 credits** |

Migration is intentionally credit-free. Existing enterprise AI keeps running on its own budget.

---

### 9. Critical Blockers (must clear before W1)

- [ ] Owner completes items 1–4 of §7
- [ ] Shopify tool enabled in Lovable (requires user click)
- [ ] Confirmation that legacy `products` table can be frozen for writes from AI (or that mirror-back path is acceptable)
- [ ] Confirmation that `legacy.getpawsy.pet` subdomain can be provisioned for rollback

---

### 10. Final Recommendation

**CONDITIONAL GO.**

Architecture is sound: Shopify as commerce engine + Supabase as intelligence layer is the correct enterprise pattern and preserves every protected system verbatim. Commerce volume (38 lifetime orders) means migration risk is dominated by SEO/Pinterest destination continuity, not order data — and that risk is fully mitigated by the W5 redirect gate.

**Proceed to W0 (owner prerequisites) upon approval of this plan.** No Shopify resources, no code, no migrations will be created until you explicitly approve.

Reply **"Approve W0"** to begin owner prerequisite tracking, or request changes to any wave, risk, or scope boundary above.
