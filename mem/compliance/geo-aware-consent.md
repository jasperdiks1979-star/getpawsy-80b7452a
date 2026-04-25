---
name: Geo-aware marketing consent
description: Non-EU visitors auto-grant marketing consent (CCPA opt-out regime); EU visitors require explicit GDPR opt-in via cookie banner. Decision is timezone-derived, persisted 30 days, and instrumented with a client-side event log.
type: feature
---
# Geo-aware marketing consent

## Decision logic — `src/lib/geoConsent.ts`
- Detects region via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- `Europe/*` (minus RU/BY/UA exclusions) → GDPR → banner required.
- All other zones → CCPA-style opt-out → auto-grant on first paint.
- Fail-closed: missing/unknown tz defaults to GDPR.
- Result cached in `localStorage` under `gp_geo_consent_decision` (v1, 30-day TTL). Cache invalidated when tz or dev-override changes.

## TikTok pixel — `src/lib/deferred-analytics.ts`
- Pixel ID `D7KDRMBC77U9EB7RJROG`. Loaded deferred after React mount.
- EU → `holdConsent()` until banner accept.
- Non-EU → `grantTikTokConsentWhenReady()` polls every 100ms (≤30 attempts) until the real SDK `grantConsent` is hydrated, then calls it. Avoids the queued-stub no-op.
- Same retry helper is invoked from `setConsent('all', …)` so banner accepts also reliably grant.

## Dev override — `src/components/dev/DevConsentToggle.tsx`
- Floating panel on `localhost` / `*.lovable.app` / `*.lovable.dev` only.
- Buttons: Auto · 🇪🇺 EU · 🇺🇸 US. Toggle clears geo decision + cookie consent and reloads.
- Live readout: tz, gdpr, auto-grant, ttq state (granted/held/revoked), stored cookie, event-log summary.

## Diagnostic logging — `src/lib/consentLog.ts`
- Ring buffer (max 200) in `localStorage` under `gp_consent_log`.
- Records every consent change with a `source`: `auto-grant-geo`, `banner-accept`, `banner-reject`, `dev-toggle`, `revoke`.
- Every TikTok event helper (`page`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `CompletePayment`) calls `logTikTokEvent()`, which captures the live ttq consent state + last source so we can verify events fire under the correct context.
- Console: `window.__consentLog()`, `window.__consentLogSummary()`, `window.__consentLogClear()`.
- Dev panel surfaces summary inline; `held/revoked-fires` count goes red if any pixel event fires under a non-granted state.

## Why
- US is the only paid-traffic target; auto-granting non-EU avoids losing 100% of pixel data behind an unnecessary GDPR banner.
- Persistence keeps consent stable across sessions even if the browser tz briefly flips (VPN, travel).
- The event log is the audit trail proving pixel events fire when (and only when) consent is in the expected state.
