# GetPawsy autonomous execution ledger

Machine-readable resumption record. Source of truth for "what is still open".
Last verified: 2026-09-16 18:55 UTC.

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
| Raw HTML and pre-hydration shell | IN PROGRESS | `index.html` now uses the cat litter-box imagery and cat-first copy; stale bestseller, broad-pet and 3–7-day delivery claims removed |
| No-JavaScript fallback | IN PROGRESS | Skidzo/GetPawsy identity preserved; shipping timing is checkout-confirmed; $35 free-shipping threshold and 30-day returns retained |
| Hydrated homepage | IN PROGRESS | `V2HomePage.tsx` queries the exact five documented hero IDs in source order, removes dog/bestseller primary merchandising, and links validated Sets |
| Successful boot recovery cleanup | IN PROGRESS | `src/main.tsx` removes both recovery elements immediately after a healthy mount |
| Regression coverage | IN PROGRESS | `src/test/homepage-delivery-consistency.test.ts` locks stale phrases/assets, exact hero identity, shipping fallback wording and recovery cleanup |

Verification and production readback pending. Security B and all checkout/payment/order/refund/admin controls unchanged.
