# Tracking Reliability Report — TRK Phase 1–5

Date: 2026-05-29
Scope: GetPawsy funnel tracking pipeline (PDP → ATC → cart_open → checkout_click → checkout_redirect_success / checkout_error).

## 1. What the 10h baseline showed

| Symptom | Reading |
|---|---|
| Sessions / visitors | 187 / 191 |
| PDP views | 66 |
| add_to_cart events | 0 |
| checkout_* events | 0 |
| Device unknown share | high |
| Geo unknown share | > 70% |
| TikTok / Pinterest identified | unreliable |

Translation: we could not trust any conversion decision — the floor of the funnel was invisible and the top of the funnel was misclassified.

## 2. Root causes (confirmed)

1. **No central event envelope.** ATC / checkout calls were scattered, each with its own (and often missing) device / geo / bot fields → rows landed without a `classification` we could filter on.
2. **No idempotency contract.** Double-fire from React renders and sticky CTAs duplicated whatever did get logged, inflating noise rather than data.
3. **Device classifier missing in-app / unknown handling.** TikTok/Instagram/Pinterest WebViews fell through to `device='unknown'`.
4. **Geo classification was opportunistic.** No deterministic edge call, no caching contract, no `geo_country` on most rows.
5. **No QA channel.** Any test fire polluted production KPIs, so we never tested in prod.
6. **No admin observability.** `/admin/funnel-health` couldn't separate bot vs. user vs. QA, so a "0 ATC" reading was indistinguishable from "ATC fires but is filtered".

## 3. What shipped (TRK-1 → TRK-5)

### TRK-1 — Tracking envelope + geo/device classification
- New central envelope (`src/lib/funnelEvents.ts`) writing on every row:
  `session_id`, `event_source`, `idempotency_key`, `user_action_id`,
  `is_bot`, `bot_reason`, `traffic_quality_score`, `geo_quality`,
  `classification` (`verified_user | probable_user | bot_like | legacy_unknown | qa`),
  `geo_tier`, `geo_country`, `device`, `os_family`, `browser_family`, `in_app_browser`.
- Geo classification hardened (`src/lib/geoClassify.ts` + `supabase/functions/geo-classify`) — idle-scheduled, cached per session, never blocks render.
- Migration `20260529071248_*.sql` added the supporting columns and indexes.

### TRK-2 — Add-to-Cart hardening
- `fireUserAddToCart` accepts an optional `slug` fallback; rows are tagged `degraded: true` when `product_id` is missing but slug is present.
- `CartContext.addItem` forwards `slug` so the degraded path is reachable from every PDP / drawer entry point.
- Bot filter + 10s idempotency dedupe enforced centrally — never from rehydrate, only from real click handlers.

### TRK-3 — Checkout click + redirect
- `fireCheckoutClick` wired on:
  - Cart desktop sidebar (`cart_proceed_button`)
  - Cart mobile sticky bar (`cart_sticky_button`)
  - Floating cart drawer (`floating_cart_checkout`)
- `Checkout.tsx` sanitises `error_reason` (emails, Stripe keys, Bearer tokens, JWTs, hex blobs stripped; capped at 200 chars) before `checkout_error` is fired.
- `cart_open` already covered on `/cart` mount and `FloatingCartPreview` open.

### TRK-4 — Admin dashboard upgrade (`/admin/funnel-health`)
- **Clean vs Raw** toggle. Clean = `(verified_user | probable_user) AND !is_bot AND !qa`.
- **QA simulation buttons** for `pdp / atc / checkout_click / redirect_success / checkout_error` — all tagged `qa: true, classification: 'qa'`, bypassing bot filter + dedupe but excluded from Clean KPI.
- Quality cards: Data Quality Score, Unknown Geo %, Unknown Device %, In-app browser volume.
- Funnel KPIs: PDP → ATC → Checkout → Payment, mode-aware.
- Latest-events inspector (top 40, both tables) with device + geo tier.
- Sanity warnings (e.g. "Clean ATC > 0 but checkout_clicks = 0").

### TRK-5 — Tests + diagnostic + this report
- `src/test/funnel-events.test.ts` (9 tests): ATC verified path, slug-fallback / degraded, no-id skip, 10s dedupe, bot skip, QA bypass; checkout_click + checkout_error + dedupe.
- `src/lib/diagnostics/trackingCsv.ts` + `src/test/tracking-csv.test.ts` (3 tests): RFC-4180 CSV parser + analyser producing `data_quality_score`, per-event raw/clean counts, and sanity warnings — same contract as the admin dashboard.
- All 12 new tests pass under `bunx vitest run`.

## 4. Out of scope (intentionally untouched)

- Stripe `create-checkout`, `stripe-webhook`, pricing, subscriptions.
- Canonical / sitemap / robots / merchant feed.
- Product catalog, RLS, storefront copy or layout.
- Any logging of PII, Stripe keys, tokens, or hashes.

## 5. How to validate after publish (one manual mobile pass)

On a real mobile device with `?utm_source=pinterest&utm_medium=pin&utm_campaign=qa`:

1. Open a PDP → `pdp_view` row, `device='mobile'`, `classification='verified_user'`.
2. Tap Add to cart → `add_to_cart` row, `degraded=false`, `qa=false`.
3. Open the cart → `cart_open` row.
4. Tap Checkout → `checkout_click` row (cart_sticky_button or floating_cart_checkout depending on entry).
5. If Stripe URL opens → `checkout_redirect_success`. If not → `checkout_error` with sanitised `error_reason`, no PII.
6. `/admin/funnel-health` in Clean mode shows the new rows; Raw mode shows them plus any bots; QA simulation buttons appear in a separate `qa` bucket.

Pass criteria from the brief:

- 1 verified mobile session, 1 PDP view, 1 add_to_cart, (optional) 1 cart_open, 1 checkout_click, 1 checkout_redirect_success if Stripe opens, 0 checkout_error otherwise.
- `device != 'unknown'`, `utm_source` retained, QA + bot rows excluded from Clean KPI.

## 6. Files touched (cumulative TRK-1 → TRK-5)

- `src/lib/funnelEvents.ts` (envelope + ATC + checkout + QA flag)
- `src/lib/geoClassify.ts`, `supabase/functions/geo-classify/index.ts`
- `src/lib/deviceClassify.ts` (envelope consumer)
- `src/contexts/CartContext.tsx` (slug forwarding)
- `src/pages/Cart.tsx`, `src/components/cart/FloatingCartPreview.tsx`, `src/pages/Checkout.tsx`
- `src/pages/admin/FunnelHealth.tsx`
- `src/lib/diagnostics/trackingCsv.ts` (new)
- `src/test/funnel-events.test.ts`, `src/test/tracking-csv.test.ts` (new)
- `supabase/migrations/20260529071248_*.sql`
- `docs/tracking-audit.md`, `docs/tracking-reliability-report.md`

## 7. Next watch-list (not in this phase)

- Once Clean KPIs are live, alert when `unknown_geo_pct > 30` or `unknown_device_pct > 20` for >1h.
- Backfill `classification` on historical rows for trend continuity.
- Add server-side echo from `create-checkout` so `checkout_redirect_success` is verifiable even if the client unloads.