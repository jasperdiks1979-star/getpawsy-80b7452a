# TRK-1 Funnel Tracking Audit

Last updated: 2026-05-29. Inventory of every funnel-relevant event fired from
the storefront, where it is written, and what table it lands in.

## Events

| Event | Fired from | Sink table | Notes |
|---|---|---|---|
| `pdp_view` | `src/hooks/usePdpFunnelTracking.ts` (idle-deferred on mount) → `firePdpView` | `lp_funnel_events` | Once per (session, product). |
| `add_to_cart` | `src/contexts/CartContext.tsx::addItem` → `fireUserAddToCart` | `lp_funnel_events` | Only path that counts in admin dashboard. Bot-filtered, 10s dedupe. |
| `cart_open` | `fireCartOpen` (call sites: cart drawer open, `/cart` mount) | `lp_funnel_events` | One per open. |
| `checkout_click` | `Cart.tsx` / `Checkout.tsx` CTA handler → `fireCheckoutClick` | `checkout_funnel_events` | Bot-filtered, 10s dedupe. |
| `checkout_redirect_attempt` | (TRK-3, planned) | `checkout_funnel_events` | Fired immediately before `create-checkout` invoke. |
| `checkout_redirect_success` | After Stripe URL received, before `window.location.href=` | `checkout_funnel_events` | |
| `checkout_error` | `catch` block around Stripe invoke | `checkout_funnel_events` | Code + safe message only, never tokens / PII. |
| `payment_success` | `src/pages/PaymentSuccess.tsx` → `firePaymentSuccess` | `lp_funnel_events` | Webhook is the source of truth for $$; this is for funnel completion visibility only. |
| `scroll_depth_{25,50,75,100}` | `usePdpFunnelTracking` scroll listener | `lp_funnel_events` | Once per milestone per session+page. |
| `rage_click` | `usePdpFunnelTracking` click buffer (≥3 clicks <800ms same target) | `lp_funnel_events` | `skipDedupe`. |
| `session_end` / `session_bounce` | `usePdpFunnelTracking` on `visibilitychange=hidden` / `pagehide` | `lp_funnel_events` | One per session via `sessionStorage` flag. |
| `return_visit` | `usePdpFunnelTracking` via `localStorage` visitor counter | `lp_funnel_events` | |

## Quality columns (per row, populated by `envelope()` in `src/lib/funnelEvents.ts`)

- `classification` — `verified_user | probable_user | bot_like | legacy_unknown | qa`
- `qa` — boolean; `true` = admin-simulated, excluded from Clean KPIs
- `geo_tier` — `verified_us | probable_us | non_us | unknown | bot_like`
- `geo_country` — ISO-2 from edge header → IP lookup → accept-language fallback
- `device` — `mobile | tablet | desktop | unknown`
- `os_family`, `browser_family`, `in_app_browser` — from `deviceClassify.ts`
- `is_bot`, `bot_reason`, `traffic_quality_score` — from `botDetection.ts`
- `event_source` — `user_click | system_restore | bot_filtered | debug | crawler | unknown`
- `idempotency_key` — `djb2(session|event|product|variant|10s-bucket)`
- `deduped` — `true` if collapsed by the 10s window

## Clean KPI filter (used by `/admin/funnel-health` Clean mode)

```
classification IN ('verified_user', 'probable_user')
  AND qa = false
  AND is_bot = false
  AND created_at > now() - $window
```

## What was broken on 2026-05-29 (TRK-1 fixes)

1. **Grants missing** on `lp_funnel_events` and `checkout_funnel_events` — only `sandbox_exec` had INSERT. Anon/authenticated had nothing. Added grants.
2. **geo-classify** read `cf-ipcountry` which Supabase edge functions don't receive → 99% of rows had `geo_quality='unknown'`. Added IP-based fallback (ipapi.co, 1.5s timeout) + accept-language weak signal + `us_tier` field.
3. **Device / classification not stored as columns** — only inside `raw_payload`, so the admin dashboard couldn't filter "real US mobile users" efficiently. Added columns + indexes.
4. **No `classification` label** — added `verified_user`/`probable_user`/`bot_like`/`legacy_unknown`/`qa` computed in the central `envelope()`.

## Out of scope for TRK-1 (handled in later phases)

- TRK-2: cart_open wiring on drawer + `/cart` route, fallback for missing product_id.
- TRK-3: explicit `checkout_redirect_attempt` event around `create-checkout` invoke.
- TRK-4: `/admin/funnel-health` Clean/Raw mode toggle + breakdown cards + QA buttons.
- TRK-5: Vitest coverage + CSV diagnostic importer.