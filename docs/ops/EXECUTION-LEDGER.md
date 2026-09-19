# GetPawsy autonomous execution ledger

Machine-readable resumption record. Source of truth for "what is still open".
Last verified: 2026-09-16 21:02 UTC.

Global verification at last run: `vitest` 1072 passed / 1 skipped / 0 failed,
`tsgo --noEmit` clean, build OK, production smoke `/ /shop /bundles /cart
/track-order /sitemap.xml /robots.txt` all 200 on https://getpawsy.pet.

| phase | status | evidence | files / migrations | tests | deploy + readback | blocker |
|---|---|---|---|---|---|---|
| P0 | COMPLETE | roadmap.md L3 | pricing-policy, checkout discount gate | suite green | published | — |
| P1 | COMPLETE | roadmap.md L4 | create-checkout, abandoned-cart idempotency | suite green | deployed | — |
| P2 | COMPLETE (n/a) | roadmap.md L5 — scope absorbed by Security A / Commerce J–N | — | — | — | — |
| Security A | COMPLETE | roadmap.md L6–7 | `_shared/admin-guard.ts`, `_shared/monitor-auth.ts`, 19 cron jobs send `x-internal-secret` | `src/test/security-a.test.ts` | anon/bad-secret verified 401 | — |
| Commerce J | COMPLETE | roadmap.md L8 | stripe-webhook, verify-payment-session | suite green | deployed | — |
| Commerce K | COMPLETE | roadmap.md L9 | exact-variant identity cart→order | `src/test/*variant*` | deployed | — |
| Commerce L | COMPLETE | roadmap.md L10 | server inventory/shipping eligibility | suite green | deployed | — |
| Commerce M | COMPLETE | roadmap.md L11 | admin-refund-order (dry-run), order-recovery-queue | suite green | deployed | real refunds need `REFUNDS_ENABLED` |
| Commerce N | COMPLETE | roadmap.md L12 | one pricing engine, leased webhook dedupe | suite green | deployed | — |
| B (routing) | COMPLETE | roadmap.md L13 | App.tsx route table, admin-nav | route-uniqueness test | published | — |
| C (truth labels) | COMPLETE | roadmap.md L14 | `src/lib/truthLabels.ts` | suite green | published | — |
| G (monitoring semantics) | COMPLETE | roadmap.md L15 | analytics-canonical window reporting | suite green | deployed | — |
| H (authorization) | COMPLETE | roadmap.md L16 | AdminRouteGuard coverage | security-a test | published | — |
| I (storefront/admin boundary) | COMPLETE | roadmap.md L17 | tracking exclusions, legacy-link-guard removed | ecommerce-events-regression | published | — |
| D (admin IA) | COMPLETE | roadmap.md L18 | `src/components/admin/admin-nav.ts` | nav uniqueness test | published | — |
| E (write safety) | COMPLETE | roadmap.md L19 | `src/lib/riskyActions.ts`, RiskyActionButton | suite green | published | — |
| F (freshness) | COMPLETE | roadmap.md L20 | `src/lib/freshness.ts`, FreshnessBadge | suite green | published | — |
| Cleanup / DB load | COMPLETE | roadmap.md L21, L25 | `docs/db-load-repair-ledger.md` | 90/90 live reads OK | verified | — |
| Commercial rebuild 1–10 | COMPLETE | `docs/commercial-rebuild/phase{1..10}` | catalog roles, claims cleanup, KPI truth | phase9/phase10 claim tests | published | hero specs + delivery windows need supplier reply |
| Phase 11 activations | COMPLETE | `docs/commercial-rebuild/phase11/ACTIVATION-LEDGER.md` | send-review-request | review-request-safeguards | 3 CJ tickets sent, review emails ENABLED | awaiting CJ replies |

## OPEN items (all externally gated, none actionable internally)

1. `REFUNDS_ENABLED` secret unset — `admin-refund-order` stays dry-run. Needs user approval.
2. CJ spec tickets T202609161615150281 / …210411 / …272491 AWAITING_CJ_REPLY — hero
   assembled dimensions, materials, weight limits, cleaning, certification stay off the PDPs.
3. Delivery/ETA windows: no trustworthy lane evidence exists; claims stay off.
4. Genuine reviews: emails enabled, but no delivered customer order is eligible yet.
5. Paid acquisition: explicitly NOT approved; remains off.

NEXT_OPEN_PHASE: none internally actionable — all sequenced phases verified COMPLETE.
Resume point is whichever OPEN item above receives external input first.

## Run 2026-09-16 18:55–19:00 UTC — claim hygiene sweep (phase 12)

| item | status | evidence |
|---|---|---|
| Product FAQ block fabricated per-category answers (infrared sensors, self-cleaning cycles, <50 dB, weight capacities, sisal longevity, airline cabin fit, assembly times, "Most customers …") on live PDPs | FIXED | `src/components/products/ProductFAQAccordion.tsx` now answers store policy + variant/spec provenance only |
| Same fabrications published as FAQPage JSON-LD to search engines | FIXED | `src/components/seo/FAQSchema.tsx` — category branch removed; "products are tested" answer replaced with the published-specification wording |
| "Frequently Bought Together" heading on bestseller PDP | FIXED | `src/components/products/BestsellerBundleSection.tsx` → "Add to your order" |
| "Most customers add these for the full experience" in cart/checkout upsell | FIXED | `src/components/cart/CartUpsell.tsx` |
| "Best Seller" badge + "Popular in …" heading on SEO collections | FIXED | `src/components/seo/CategoryPopularProducts.tsx` → "Our pick" / "Our picks in …" |
| "🔥 Best Sellers" / "Popular with … lovers" in category empty state | FIXED | `src/components/products/CategoryEmptyState.tsx` → "Our picks" |
| Regression coverage | ADDED | `src/test/phase12-claims.test.ts` (7 tests) |

Verification: 1079 passed / 1 skipped / 0 failed, `tsgo --noEmit` clean, build OK,
production smoke all 200. No database, payment, supplier, email or ad action taken.

## NEXT_OPEN_PHASE — Security B: unauthenticated edge functions (4 critical findings, 2026-09-16)

Surfaced by the publish-time security scan, not previously in the roadmap. All four are
edge functions reachable without authentication:

1. `aci-orchestrator*` — can write internal automation state.
2. `add-internal-links` — can rewrite all published blog content.
3. `analytics-canonical` — leaks revenue, funnel and visitor geolocation data.
4. `genesis-omega*` — can write certification/intelligence data.

Planned fix: apply `requireInternalOrAdmin` / `requireMonitorCaller` from
`supabase/functions/_shared/`, exactly as Security A did, after enumerating every caller
(cron jobs already send `x-internal-secret`; admin dashboards call with a user JWT).
Must be done caller-first — `analytics-canonical` backs live admin dashboards and the
stabilization monitor, so guarding it blind would break them.

## SECURITY B — caller map + hardening (2026-09-16 19:2x UTC)

### B1 — read-only caller map (inspection only, no production mutation)

| function | callers (exact) | invocation | current auth | freq | data | anon needed? | required auth | proposed control | regression risk | verification |
|---|---|---|---|---|---|---|---|---|---|---|
| `aci-orchestrator` | `src/pages/admin/AutonomousCommercePage.tsx:88` (`supabase.functions.invoke`); `cmdr-orchestrator/index.ts:103` **plan row only — never invokes**; no cron job (`cron.job` scan: none) | admin browser invoke (user JWT) | **NONE — anonymous** | manual | writes `aci_runs`, `aci_run_steps`, `aci_audit_log`; fans out to 4 internal fns with service-role bearer | no | admin JWT or internal secret | `requireInternalOrAdmin` first statement in handler | low — only caller already sends an admin JWT | `src/test/security-b.test.ts`; live anon call must be 401 |
| `add-internal-links-to-blogs` | no runtime caller in `src/`, `scripts/`, other functions, or `cron.job` | — | **already guarded** (`admin-guard.ts`, line 189, before any `.update()`) | — | rewrites `blog_posts.content` | no | admin JWT / internal secret | no change — already narrowest | none | `security-b.test.ts` guard-order assertions |
| `analytics-canonical` | `src/hooks/useCanonicalFunnel.ts`, `useAnalyticsTruth.ts`, `CleanAnalyticsPanel`, `VisitorWorldMap`, `ProKpiHeader`, `SessionEvidencePanel`, `V2EnvelopeBadge`, `PinterestTrafficPanel`, `AnalyticsCanaryV2`, `FunnelHealthCenter`, `CustomerJourneyCenterPage`, `LiveEventsPage`, `PinterestAttributionHealthPage`, `VisitorWorldMapProPage` (all `supabase.functions.invoke`, admin JWT, behind `AdminRouteGuard`); `visitor-map-stabilization-monitor`, `analytics-canonical-warmer`, `world-map-debug`, `edge-functions-health` (fn→fn, `x-internal-secret`); `scripts/analytics-truth-parity-probe.mjs` (CI) | invoke + fn→fn | **already guarded** (line 1264, first statement of handler) | dashboards on demand; warmer via cron jobs 343–354 (15–360 min) | revenue totals, funnel, order values, per-session lat/long/city | **no** | admin JWT or internal secret | no change; warmer keeps its own dedicated `ANALYTICS_WARMER_SECRET` | high if broken → asserted both ways | `security-b.test.ts` + live 401 anon + dashboards load |
| `genesis-omega-architect` | `src/pages/admin/GenesisOmegaArchitectPage.tsx:43` (`supabase.functions.invoke`) | admin browser invoke | inline JWT + `user_roles` admin check, 401/403 fail-closed | manual | read-only inventory via service role | no | admin role | keep inline server-side role check (already strictest: role-verified, not merely logged in) | none | `security-b.test.ts` role-check ordering assertions |
| `genesis-omega-board` / `-boardroom-certify` / `-infinity` / `-perpetual` / `-truth`, `genesis-v15-twin`, `genesis-golden-adaptive-wave` | admin Genesis pages (`GenesisOmegaPage`, `GenesisBoardroomV5Page`, `GenesisPerpetualCompanyPage`, `GenesisOmegaTruthPage`, `GenesisDigitalCompanyPage`) via `supabase.functions.invoke` | admin browser invoke | **already guarded** (`requireInternalOrAdmin` before any write) | manual | certification/intelligence writes via service role | no | admin JWT / internal secret | no change | none | `security-b.test.ts` guard + order assertions |

Scan snapshot context: the four critical findings are dated `2026-09-16T17:00:16Z`. Code inspection at 19:2x UTC shows three of the four were already remediated in-code before that snapshot was consumed; only `aci-orchestrator` was genuinely unguarded.

### B2 — hardening applied

| change | file | effect |
|---|---|---|
| `requireInternalOrAdmin` as first handler statement; `x-internal-secret` added to CORS allow-headers | `supabase/functions/aci-orchestrator/index.ts` | anonymous callers get 401 before any DB write or fan-out |
| Security B batch registered | `supabase/functions/_shared/guarded-functions.ts` | 11 function names added to the canonical guarded registry |
| Regression coverage | `src/test/security-b.test.ts` (30 tests) | anon denial, guard-before-privileged-work ordering, revenue/geo behind guard, warmer internal-secret path, mapped admin callers unchanged, no secrets in client bundle |

No checkout/payment/refund/order/customer-email/supplier/ads behaviour touched. No new cron job, no polling, no extra DB load.

### Security B — verification + release (2026-09-16 19:33 UTC)

| check | result |
|---|---|
| deploy | `aci-orchestrator` redeployed |
| anon POST `aci-orchestrator` / wrong secret | 401 / 401 |
| anon POST `analytics-canonical`, `add-internal-links-to-blogs`, `genesis-omega-boardroom-certify` | 401 |
| anon POST `analytics-canonical-warmer` (wrong secret) | 401 |
| `admin_guard_audit_log` (last 30m) | anon calls `unauthorized`; `analytics-canonical` `internal_secret` → `allowed` ×6 (cron warmer/monitors unaffected) |
| tests | 1109 passed / 1 skipped (incl. new `security-b.test.ts`, 30 tests) |
| typecheck / build | clean / build OK |
| security scan | 0 critical, 0 error findings; 3 pre-existing warns already dismissed by the user |
| production smoke | `/ /shop /bundles /admin/analytics/visitor-world-map-pro /sitemap.xml` all 200 |

SECURITY B: **COMPLETE**. NEXT_OPEN_PHASE: none internally actionable — remaining items are the five externally gated ones listed above.

## Production delivery / fallback / homepage consistency repair (2026-09-16)

| item | status | evidence |
|---|---|---|
| Raw HTML and pre-hydration shell | COMPLETE | `index.html` uses cat litter-box imagery and cat-first copy; stale bestseller, broad-pet and 3–7-day delivery claims removed |
| No-JavaScript fallback | COMPLETE | Skidzo/GetPawsy identity preserved; shipping timing is checkout-confirmed; $35 free-shipping threshold and 30-day returns retained |
| Hydrated homepage | COMPLETE | `V2HomePage.tsx` queries the exact five documented hero IDs in source order, removes dog/bestseller primary merchandising, and links validated Sets; legacy `HomePage.tsx` now aliases this sole implementation |
| Successful boot recovery cleanup | COMPLETE | `src/main.tsx` removes both recovery elements immediately after a healthy mount; desktop/mobile browser checks found zero recovery banners |
| Public guide claim path | COMPLETE | historical unsupported comparison configuration is fail-closed by `getDominationConfig`; collection and schema consumers receive no legacy claim payload |
| Regression coverage | COMPLETE | `homepage-delivery-consistency`, Phase 10/12, and Security B focused tests: 48 passed; full suite: 1120 passed / 1 skipped; `tsgo --noEmit` clean; build OK |

Local desktop/mobile readback: five documented product slugs visible, cat-first H1 present, no stale copy, no recovery warning, and no horizontal overflow. Production readback after deployment: raw HTML and crawler shell are cat-first with checkout-confirmed delivery; `/`, `/products`, `/shop`, `/bundles`, `/cart`, `/checkout`, `/admin`, `/sitemap.xml`, `/robots.txt`, and `/guides` returned 200. Hydrated desktop/mobile checks showed all five hero links, zero recovery banners, zero stale phrases, no page errors or mobile overflow; `/admin` redirected to sign-in. Security scan: 0 critical/error findings (three user-ignored warnings only). Security B and all checkout/payment/order/refund/admin controls unchanged.

## Four-issue repair pass (2026-09-17)

| # | issue | root cause (evidence) | fix | files |
|---|---|---|---|---|
| 1 | Sign-in/session timeouts while analytics overload the DB | `supabase--slow_queries`: unbounded paging scans of `visitor_activity`, `canonical_events`, `canonical_sessions` (25–40 s/call; ~1,900 and ~970 calls) and health-probe exact counts near 40 s; warmers held connections ~150 s, starving auth/token requests | 90 s compute budget + 200k-row cap on all three paging loops with a `load_shedding.truncated_scans` report instead of silent stalls; scan wave reduced to 3; health probe no longer requests `count: "exact"` on hot tables (single newest-row read); existing single-flight lock and stale-cache fallback preserved | `supabase/functions/analytics-canonical/index.ts`, `supabase/functions/analytics-health-probe/index.ts` |
| 2+4 | Multi-option item added outside the product page blocks checkout | Non-PDP add-to-cart callers (shop grid, rails, bundles, upsells, wishlist) added the bare product id; `create-checkout` fails closed with `variant_required` | Central guard in `CartContext.addItem` (`enforceVariantSafety`): a bare line on a product with >1 sellable option is removed and the shopper is routed to the product page to choose; 0/1-option products unchanged; verification failure fails open because cart recovery UI and the server both still fail closed | `src/contexts/CartContext.tsx` (uses `src/lib/quickAdd.ts`) |
| 3 | AOS incident handling broken by schema drift | `public.arie_incidents` has no `title` and no `status` column; AOS selected both, so every incident read errored, no tasks/events were created, and health scoring read the error as zero incidents | Shared schema contract module; AOS readers use real columns (`type`, `resolved_at IS NULL`), derive title/category from `type`+`root_cause`, restore event/task generation, and report degraded instead of healthy on read failure | `supabase/functions/_shared/arieIncidents.ts`, `supabase/functions/aos-orchestrator/index.ts`, `supabase/functions/aos-engine-integrator/index.ts` |

Regression coverage: `src/test/four-issue-repair.test.ts` (12 tests) fails CI on a reintroduced unbounded/unbudgeted scan, an exact count in the health probe, a missing central cart guard, or any `title`/`status` reference in an ARIE incident query. No schema migration was required; no destructive change.

Verification: full suite 1129 passed / 1 skipped; `tsgo --noEmit` clean; build OK; edge functions `aos-orchestrator`, `aos-engine-integrator`, `analytics-canonical`, `analytics-health-probe` deployed. DB health after changes: up, PgBouncer up, 35/60 connections, pool clients 8/200, 0 restarts. Smoke: `/`, `/products`, `/shop`, `/bundles`, `/cart`, `/checkout`, `/sitemap.xml` all 200, zero page errors, `/admin` redirected to sign-in. Cart recovery verified live: a legacy bare line on a multi-option product shows "Choose an option" and checkout stays blocked until an exact option is chosen. Security B, admin auth, checkout, payments and supplier paths untouched; no payment, refund, supplier order, customer email, ad spend or external publication was performed.

## Public product view visibility gap (2026-09-17)

| item | detail |
|---|---|
| Symptom | Cart-side option check could not read some products (e.g. Enclosed Cat Litter Box `e265e7fe-af60-4efc-b927-5c4f79fc1bf0`), so "option required" was unknown before checkout |
| Root cause (evidence) | RLS policy `Public can view listable products` on `public.products` requires `(stock IS NULL OR stock > 0)`; `products_public` is `security_invoker=on`, so an active, non-duplicate but zero-stock product is correctly hidden from the catalog *and* from the option validator. Compared: enclosed litter box (stock 0, hidden), multi-option cat bed `d3898f50-…` (stock 25431, visible), stainless litter box `1daefaa0-…` (stock 4658, visible) |
| Fix | New id-scoped, read-only RPC `public.product_option_metadata(p_ids uuid[])` (SECURITY DEFINER, STABLE, `search_path = public`): returns `id, slug, is_active, stock, variants` where variants are stripped to option descriptors (`vid, variantKey, variantNameEn, variantStock, stock, inventories`). Filters `is_active = true AND COALESCE(is_duplicate,false) = false`; no stock predicate. No price, cost, supplier, revenue, visitor or admin fields; no enumeration (explicit id list required). `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO anon, authenticated, service_role` |
| Files / migrations | `drizzle/migrations/0000_product_option_metadata_rpc.sql`, `src/lib/productOptionMetadata.ts` (new), `src/contexts/CartContext.tsx`, `src/hooks/useCartVariantIssues.ts`, `src/test/product-option-metadata-rpc.test.ts` (new) |
| Unchanged | Catalog visibility, stock rules, duplicate suppression, publication logic, SEO routing, `products_public` definition and grants, Security B, admin auth, server-side `variant_required` fail-closed authority |
| Tests | `product-option-metadata-rpc` (10) + `four-issue-repair` (12) + `public-catalog-boundary` (5) + `quick-add-variant-invariant` (13) = 40 passed; full suite 1139 passed / 1 skipped; `tsgo --noEmit` clean; build OK; security scan: 0 critical/error (3 pre-existing user-dismissed warns) |
| Readback | Anonymous RPC call returns the enclosed litter box with one option descriptor and no sensitive fields; browser check: legacy bare multi-option line still shows "Choose an option", zero page errors |

## Supplier SKU discontinuation — CJ CJTC276169401AZ (2026-09-18)
- **Status:** COMPLETE
- **Mapping evidence:** `products.variants[0].variantSku = CJTC276169401AZ` → product `e265e7fe-af60-4efc-b927-5c4f79fc1bf0`, slug `front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265` (single variant "White", cj_product_id 2022147992715550722). CJ ticket T202609161615150281.
- **Pre-state:** stock/us/eu/cn = 0, effective_stock 0, stock_sync_status `discontinued`, but `availability = 'in stock'`, supplier_status `available`, stale variant warehouse inventory 292, and it was hero slot #1, a starter-set bundle component, in the curated merchant lists and in the static feed/sitemap snapshots claiming "in stock".
- **Data change:** `products` row `e265e7fe…` → availability `out of stock`, supplier_status `discontinued`, stock/us/eu/cn 0 (idempotent; `is_active` left true, URL, images and copy preserved; no deletion).
- **Files:** `src/components/v2/storefront/V2HomePage.tsx` (hero slot 1 → `128e0207-8a94-4d71-b428-5b7f5002528f`, verified US-stock automatic litter box), `src/lib/bundles.ts` (starter-set litter box component swapped to the same verified product), `src/config/merchant-top50.ts`, `supabase/functions/export-merchant-feed/index.ts` (ID removed from curated lists), `public/merchant-feed.xml`, `public/google-feed.xml`, `public/google-shopping-feed.xml`, `public/sitemap-products-1.xml` (stale entries removed, XML re-validated), `src/test/discontinued-sku-guard.test.ts` (new, 6 tests), `src/test/homepage-delivery-consistency.test.ts` (hero IDs).
- **Tests:** full suite 1144 passed / 1 skipped; tsgo clean; build OK.
- **Readback:** homepage renders exactly five hero products, none of them the discontinued SKU; the discontinued PDP is not anon-readable (RLS `stock > 0`) and resolves to the catalog instead of a sellable page; starter set no longer references the retired slug; live feed exporter already filters `stock > 0`.
- **Blocker:** none. No CJ message, order, refund, email or ad spend performed.

## Supplier co-marketing outreach — CJ (2026-09-19, approved)

Channel: CJ ticket API `POST /api2.0/v1/ticket/create`, type **Business Promotion Consultation → Other**
(`1472841872740323328` / `0`). Approved request text sent verbatim (884 chars, CJ limit 1000); product
name, CJ PID, SKU and the exact GetPawsy product URL sent in the expected-result field. One request per
product, serial. Selection: active, non-duplicate, US stock > 100, live PDP 200, CJ-mapped.

| Ticket no | Product | SKU | URL | Status |
|---|---|---|---|---|
| T202609190309440531 | Automatic Cat Litter Box (self-cleaning) | CJFT239819001AZ | /products/automatic-cat-litter-box-self-cleaning-app-control | AWAITING_CJ_REPLY |
| T202609190309533581 | 54" Cat Tree Tower | CJHC231911801AZ | /products/54-cat-tree-tower-multi-level-with-sisal-grab-post-indoor-apartment-with-ladder-plush-toys-rest-and- | AWAITING_CJ_REPLY |
| T202609190310005571 | Stainless Steel Cat Litter Box With Lid | CJFT255460101AZ | /products/stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included | AWAITING_CJ_REPLY |
| T202609190310076391 | Interactive Cat Puzzle Toy | CJTE261988601AZ | /products/cat-puzzle-toy-with-ball-and-spring-loaded-wand-felt-indoor-cat-toy-box-suction-84be | AWAITING_CJ_REPLY |
| T202609190310596331 | 69" Cat Tree (2 condos, 3 hammocks) | CJTC26802290001 | /products/69-cat-tree-multi-level-cat-tower-with-2-condos-and-3-hammocks-8-scratching-posts-for-multiple-cats- | AWAITING_CJ_REPLY |
| T202609190311069511 | Cat Litter Box Enclosure with Drawers | CJFT26802550001 | /products/cat-litter-box-enclosure-with-drawers-storage-anti-tip-kit-39-x-18-x-31-5-white | AWAITING_CJ_REPLY |
| T202609190311137941 | 41" Water Hyacinth Cat Tree | CJPT27469220001 | /products/41-inch-hand-woven-water-hyacinth-cat-tree-3-sisal-scratching-posts-multi-level-41e1 | AWAITING_CJ_REPLY |
| T202609190311206841 | 2-in-1 Stainless Steel Cat Litter Box | CJFT26802590001 | /products/2-in-1-stainless-steel-cat-litter-box-with-removable-lid-scoop-filter-bags-for-small-to-large-cats-w | AWAITING_CJ_REPLY |

Duplicate note: a shell timeout re-ran the 69" cat tree item, creating T202609190310143841 as a second
copy; it was immediately marked COMPLETED via `/ticket/complete` so CJ handles only T202609190310596331.

Not contacted: discontinued CJTC276169401AZ. The two open spec tickets (T202609161615210411,
T202609161615272491) were left untouched — the marketing requests for those two products are separate
new tickets of a different type. No paid ads, orders, refunds, samples purchased or customer emails.
No storefront code changed; all eight product pages returned 200 before sending.
