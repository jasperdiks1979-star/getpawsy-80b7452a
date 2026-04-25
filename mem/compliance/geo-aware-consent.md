---
name: geo-aware marketing consent
description: Non-EU visitors auto-grant marketing consent (CCPA opt-out regime); EU visitors require explicit GDPR opt-in via cookie banner
type: feature
---
**Implementation**: `src/lib/geoConsent.ts` detects region via IANA timezone (Intl.DateTimeFormat). Europe/* timezones (excl. Russia/Belarus/Kaliningrad/Crimea) → GDPR. Everything else (America/*, Asia/*, etc.) → CCPA-style opt-out.

**Behavior**:
- EU visitors: cookie banner shown, TikTok pixel calls `holdConsent()` until user accepts
- Non-EU visitors: `setConsent('all')` runs silently on mount, banner never appears, TikTok pixel calls `grantConsent()` immediately after load
- Fail-closed: missing/unknown timezone defaults to GDPR (banner shown)

**Why**: GetPawsy targets US ads via TikTok. Forcing US visitors through a banner = ~60-80% tracking loss. CCPA legally permits opt-out tracking, so auto-consent is compliant for US.

**Wired into**:
- `src/lib/deferred-analytics.ts` — TikTok pixel grant logic
- `src/components/marketing/CookieConsent.tsx` — banner suppression for non-EU
- Debug: `window.__geoConsent()` in browser console
