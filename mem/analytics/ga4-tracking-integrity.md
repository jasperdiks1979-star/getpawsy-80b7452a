---
name: GA4 tracking integrity (no duplicates, no consent race)
description: GA4 config must use send_page_view:false; consent default must be geo-resolved synchronously before gtag('config')
type: feature
---
## Rules
- `gtag('config', '<GA_ID>', { send_page_view: false })` — page_view is fired exclusively by `SafeGlobalVisitorTracker` on every route change. Adding a second page_view source (config auto-fire OR a second tracker) creates the `_s=2/_s=3` duplicate the prod audit detected.
- Consent default MUST be resolved via `canAutoGrantConsent()` (timezone-based, synchronous) BEFORE the first `gtag('consent', 'default', ...)` call. Non-EU → `granted`, EU → `denied`. Setting denied-by-default and upgrading later produces `gcs=G100` on the first hit and loses first-session attribution.
- All page-view-producing hooks in `ProductDetail.tsx` must precede every early return (isLoading, isError, !product, showTikTokFastPdp) — putting `useState`/`useEffect` below those returns causes React error #310 and blocks the entire commerce funnel.

Patched 2026-06-16: `src/lib/deferred-analytics.ts`, `src/pages/ProductDetail.tsx`.