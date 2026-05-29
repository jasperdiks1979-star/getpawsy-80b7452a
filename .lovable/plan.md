## Tracking Reliability Overhaul — Phased

Goal: make funnel data trustworthy. **No UI polish. No Stripe/checkout/webhook/pricing/SEO changes.** Only safe instrumentation + admin diagnostics.

### Phase TRK-1 — Audit + Foundation (read-only + shared helpers)
- Map every event firing site (`session_start`, `pdp_view`, `add_to_cart`, `cart_open`, `checkout_click`, `checkout_redirect_attempt/success`, `checkout_error`, `payment_success`, `rage_click`, `scroll_depth`, `session_end`) → produce inventory in `docs/tracking-audit.md`.
- Harden `src/lib/deviceClassify.ts` (already exists): add viewport + touch fallbacks, in-app browser priority, persist to sessionStorage, re-export to `funnelEvents.ts` writer so **every** event row gets `device/os/browser_family/in_app_browser` automatically.
- Harden `src/lib/botDetection.ts`: add `legacy_unknown` vs `verified_user`/`probable_user`/`bot_like` classification, attach to every event write.
- Add stable `idempotencyKey(eventName, productId, sessionId, bucketMs)` helper + in-memory + sessionStorage dedupe in `funnelEvents.ts`.
- Edge fn `geo-classify`: read `cf-ipcountry`, `x-vercel-ip-country`, `x-country-code`, fallback to `accept-language`. Return `geo_tier ∈ {verified_us, probable_us, non_us, unknown, bot_like}`.

### Phase TRK-2 — Add-to-Cart + Cart-Open (the critical fix)
- `CartContext.addToCart`: after state confirms insert, fire `add_to_cart` once with `{product_id, slug, title, price, quantity, variant, event_source:'user_click', session_id, visitor_id, utm_*, landing_page, referrer, device_*}`.
- Suppress firing on: rehydrate from localStorage, SSR/hydration, bot-classified sessions (still log but mark `classification='bot_like'`), missing `event_source` (no auto button).
- Add `cart_open` fire on cart drawer open / `/cart` route entry (once per session per open).
- Fallback: if `product_id` missing but `slug` exists, write with `product_id=null, slug` + flag `degraded=true`.

### Phase TRK-3 — Checkout Click + Redirect (safe wrap, no Stripe changes)
- Wrap existing checkout CTA handler: fire `checkout_click` on tap, `checkout_redirect_attempt` immediately before `supabase.functions.invoke('create-checkout')`, `checkout_redirect_success` when URL received & `window.location.href=` is about to execute, `checkout_error` on throw with `{code, message_safe}` (no tokens/PII/email).
- **No changes** to `create-checkout` edge fn body, no changes to webhook, no changes to payment-success logic except already-present event mirror.

### Phase TRK-4 — Admin /admin/funnel-health Upgrade
- Two KPI modes toggle: **Clean** (classification IN ('verified_user','probable_user') AND qa=false) vs **Raw** (all).
- Cards: Data Quality Score, Tracking Reliability, Unknown Geo %, Unknown Device %, Bot-filtered %, Verified Sessions, US Verified, PDP→ATC %, ATC→Checkout %, Checkout→Payment %.
- Breakdowns: source (TikTok/Pinterest/Direct/Google/Other), device, geo tier.
- Top PDPs / landing / exit tables.
- QA buttons: Simulate PDP View / ATC / Checkout Click / Redirect Success — all marked `qa=true`, excluded from Clean.
- "Latest events" inspector table with filters (1h/10h/24h/7d, type, source, clean/qa/bot).

### Phase TRK-5 — Tests + CSV diagnostic + Report
- Vitest:
  - `add_to_cart` fires once on real click, not on render/rehydrate
  - `checkout_click` + `checkout_redirect_success` ordering
  - device classifier identifies iPhone-Safari, TikTok webview UA, Pinterest UA
  - geo classifier downgrades unknown → excluded from Clean US KPI
  - QA events excluded from Clean
  - bot UA events excluded from Clean
- Admin CSV paste-box: parse uploaded session CSV, compare counts vs DB, flag mismatches (e.g. "CSV shows 66 PDP views, DB Clean shows N — delta X").
- Final report: files changed, what was broken, mobile test steps, what should turn green, what NOT to touch.

### Hard safety rails (apply to every phase)
- No edits to: Stripe `create-checkout`, `stripe-webhook`, pricing, canonical/`useCanonical`, sitemap files, `merchant-policy`, robots, Merchant feed exporter.
- No PII / token / email / Stripe key in any log or event payload.
- No fake reviews/sales/stats.
- All admin diagnostics gated behind existing admin role check.
- Mobile LCP/CLS: tracking writes stay idle-deferred via existing `requestIdleCallback` pattern in `usePdpFunnelTracking`.

### Technical notes
- DB: writes target existing `lp_funnel_events` table (plus its session_id/classification/qa columns). If schema lacks `classification`, `qa`, `geo_tier`, `device`, `in_app_browser` columns → one additive migration (no destructive changes), with GRANTs.
- Edge fn `geo-classify` already exists — extend, don't replace.
- Use existing `getDeviceClassification()`, `getBotClassification()`, `ensureGeoClassified()` — wire them into the central event writer so call sites stay clean.

### Ask before I start
Confirm phase order **TRK-1 → TRK-5** (one phase per turn, like CI-22/23), and confirm I may add the additive migration in TRK-1 if `lp_funnel_events` is missing the columns above.